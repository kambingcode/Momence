from sqlalchemy import Engine, inspect, select, text

from clipstudio_worker.modules.projects.infrastructure.sqlalchemy_source_repository import (
    SqlAlchemySourceRepository,
)
from clipstudio_worker.modules.transcript.application import Token, Transcript
from clipstudio_worker.modules.transcript.infrastructure.sqlalchemy_transcript_repository import (
    SqlAlchemyTranscriptRepository,
)
from clipstudio_worker.modules.transcript.infrastructure.tables import transcripts


def seed_source(engine: Engine, audio_path: str | None = None) -> None:
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO projects (id, name) VALUES ('p1', 'Proyek')"))
        conn.execute(
            text(
                "INSERT INTO sources (id, project_id, original_name, path, size_bytes, "
                "duration_ms, audio_path) VALUES ('s1', 'p1', 'a.mp4', 'media/p1/source.mp4', "
                "10, 3000, :audio)"
            ),
            {"audio": audio_path},
        )


def test_mirror_table_matches_web_schema(engine: Engine) -> None:
    db_columns = {c["name"] for c in inspect(engine).get_columns("transcripts")}
    assert {c.name for c in transcripts.columns} == db_columns


def test_save_stores_tokens_as_json_and_overwrites_on_retranscribe(engine: Engine) -> None:
    seed_source(engine)
    clock = iter([111, 222])
    repo = SqlAlchemyTranscriptRepository(engine, now=lambda: next(clock))
    first = Transcript(
        project_id="p1",
        source_id="s1",
        language="en",
        tokens=[Token(id="w1", type="word", text="halo", start_ms=0, end_ms=400, confidence=0.9)],
    )
    transcript_id = repo.save(first)

    second = Transcript(project_id="p1", source_id="s1", language="id", tokens=[])
    assert repo.save(second) == transcript_id

    with engine.connect() as conn:
        rows = conn.execute(select(transcripts)).all()
    assert len(rows) == 1
    row = rows[0]._mapping  # pyright: ignore[reportPrivateUsage]
    assert (row["language"], row["words"], row["created_at"]) == ("id", [], 111)


def test_words_column_shape(engine: Engine) -> None:
    seed_source(engine)
    SqlAlchemyTranscriptRepository(engine).save(
        Transcript(
            project_id="p1",
            source_id="s1",
            language="id",
            tokens=[Token(id="w1", type="word", text="éh", start_ms=10, end_ms=20)],
        )
    )
    with engine.connect() as conn:
        raw = conn.execute(text("SELECT words FROM transcripts")).scalar_one()
    # Disimpan sebagai teks JSON (dibaca web lewat drizzle mode json).
    assert raw.startswith("[{")
    with engine.connect() as conn:
        words = conn.execute(select(transcripts.c.words)).scalar_one()
    assert words == [
        {"id": "w1", "type": "word", "text": "éh", "startMs": 10, "endMs": 20, "confidence": None}
    ]


def test_get_by_source_reads_back_saved_tokens(engine: Engine) -> None:
    seed_source(engine)
    repo = SqlAlchemyTranscriptRepository(engine)
    tokens = [
        Token("w1", "filler", "Eh,", 0, 200, 0.9),
        Token("p1", "pause", "", 200, 600, None),
        Token("w2", "word", "halo.", 600, 900, 0.8),
    ]
    repo.save(Transcript("p1", "s1", "id", tokens))

    assert repo.get_by_source("s1") == Transcript("p1", "s1", "id", tokens)
    assert repo.get_by_source("hilang") is None


def test_source_repository_returns_audio_path_and_duration(engine: Engine) -> None:
    seed_source(engine, audio_path="media/p1/audio.wav")
    record = SqlAlchemySourceRepository(engine).get("s1")
    assert record is not None
    assert (record.audio_path, record.duration_ms) == ("media/p1/audio.wav", 3000)
