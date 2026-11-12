from pathlib import Path

import pytest

from clipstudio_worker import config


def write_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, content: str) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(content)
    monkeypatch.setattr(config, "ENV_FILE", env_file)


def test_reads_key_and_model_from_env_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    write_env(tmp_path, monkeypatch, "GEMINI_API_KEY=dari-file\nCLIPSTUDIO_GEMINI_MODEL=m-file\n")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("CLIPSTUDIO_GEMINI_MODEL", raising=False)

    loaded = config.load_config()

    assert (loaded.gemini_api_key, loaded.gemini_model) == ("dari-file", "m-file")
    # Key tidak pernah ikut tercetak di log/repr.
    assert "dari-file" not in repr(loaded)


def test_shell_env_wins_but_empty_value_does_not_erase_file_key(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    write_env(tmp_path, monkeypatch, "GEMINI_API_KEY=dari-file\n")
    monkeypatch.setenv("GEMINI_API_KEY", "")
    assert config.load_config().gemini_api_key == "dari-file"
    monkeypatch.setenv("GEMINI_API_KEY", "dari-shell")
    assert config.load_config().gemini_api_key == "dari-shell"


def test_defaults_without_env_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "ENV_FILE", tmp_path / "tidak-ada.env")
    for name in (
        "GEMINI_API_KEY",
        "CLIPSTUDIO_GEMINI_MODEL",
        "CLIPSTUDIO_WEB_DIR",
        "CLIPSTUDIO_NODE",
        "CLIPSTUDIO_DOWNLOAD_CONCURRENCY",
        "CLIPSTUDIO_DISCOVER_CONCURRENCY",
    ):
        monkeypatch.delenv(name, raising=False)

    loaded = config.load_config()

    assert (loaded.gemini_api_key, loaded.gemini_model) == (None, "gemini-3.6-flash")
    assert (
        loaded.web_dir.name == "web" and (loaded.web_dir / "scripts" / "render-clip.mts").is_file()
    )
    assert loaded.node == "node"
    assert loaded.download_concurrency == config.DEFAULT_DOWNLOAD_CONCURRENCY
    assert loaded.discover_concurrency == config.DEFAULT_DISCOVER_CONCURRENCY


def test_download_concurrency_from_env_is_validated() -> None:
    assert config.load_config({"CLIPSTUDIO_DOWNLOAD_CONCURRENCY": " 4 "}).download_concurrency == 4
    assert config.load_config({"CLIPSTUDIO_DOWNLOAD_CONCURRENCY": ""}).download_concurrency == (
        config.DEFAULT_DOWNLOAD_CONCURRENCY
    )
    for bad in ("0", "33", "-2", "delapan", "2.5"):
        with pytest.raises(config.ConfigError, match="CLIPSTUDIO_DOWNLOAD_CONCURRENCY"):
            config.load_config({"CLIPSTUDIO_DOWNLOAD_CONCURRENCY": bad})


def test_discover_concurrency_from_env_is_validated() -> None:
    assert config.load_config({"CLIPSTUDIO_DISCOVER_CONCURRENCY": "1"}).discover_concurrency == 1
    for bad in ("0", "17", "empat"):
        with pytest.raises(config.ConfigError, match="CLIPSTUDIO_DISCOVER_CONCURRENCY"):
            config.load_config({"CLIPSTUDIO_DISCOVER_CONCURRENCY": bad})
