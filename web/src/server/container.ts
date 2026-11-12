import "server-only";
import { GetClipStats, ListProjectClips } from "@/modules/clips/application";
import { DrizzleClipRepository } from "@/modules/clips/infrastructure/drizzle-clip-repository";
import { GetClipEditor, SaveEditingScript } from "@/modules/editor/application";
import { DrizzleEditingScriptRepository } from "@/modules/editor/infrastructure/drizzle-editing-script-repository";
import {
  EnqueueJob,
  GetJob,
  GetProjectJobs,
  ListJobs,
  RetryJob,
} from "@/modules/jobs/application";
import { DrizzleJobRepository } from "@/modules/jobs/infrastructure/drizzle-job-repository";
import {
  DeleteProject,
  GetProject,
  RequestClipDiscovery,
  GetStorageOverview,
  ImportVideoFromUrl,
  ListProjects,
  OpenProxyVideo,
  OpenThumbnail,
  UploadVideo,
} from "@/modules/projects/application";
import { DrizzleProjectRepository } from "@/modules/projects/infrastructure/drizzle-project-repository";
import {
  OpenRenderOutput,
  StartClipRender,
} from "@/modules/render/application";
import { LocalMediaStorage } from "@/modules/projects/infrastructure/local-media-storage";
import {
  systemClock,
  uuidGenerator,
} from "@/modules/projects/infrastructure/system";
import {
  CachingStockVideoSearch,
  GetBrollPlan,
  SearchStockVideos,
  StartBrollPlan,
} from "@/modules/broll/application";
import { PixabayVideoSearch } from "@/modules/broll/infrastructure/pixabay-video-search";
import {
  GetClipCropTracks,
  GetClipReframe,
  StartClipReframe,
} from "@/modules/reframe/application";
import { DrizzleClipReframeRepository } from "@/modules/reframe/infrastructure/drizzle-clip-reframe-repository";
import {
  CheckWorkerOnline,
  GetPreferences,
  GetSettingsOverview,
  SavePreferences,
} from "@/modules/settings/application";
import { DrizzleSettingsRepository } from "@/modules/settings/infrastructure/drizzle-settings-repository";
import { GetPostCopy, StartPostCopy } from "@/modules/social/application";
import { GetProjectTranscript } from "@/modules/transcript/application";
import { DrizzleTranscriptRepository } from "@/modules/transcript/infrastructure/drizzle-transcript-repository";
import { loadConfig, type AppConfig } from "./config";
import { type Database, openDatabase } from "./db/client";

/**
 * Composition root: satu-satunya tempat adapter (infrastructure) dipasangkan ke port (application).
 * Route handler mengambil use case dari sini.
 */
export interface Container {
  config: AppConfig;
  jobs: {
    enqueue: EnqueueJob;
    get: GetJob;
    list: ListJobs;
    retry: RetryJob;
  };
  projects: {
    upload: UploadVideo;
    importFromUrl: ImportVideoFromUrl;
    list: ListProjects;
    get: GetProject;
    rediscover: RequestClipDiscovery;
    openProxy: OpenProxyVideo;
    openThumbnail: OpenThumbnail;
    delete: DeleteProject;
    storage: GetStorageOverview;
  };
  transcripts: {
    getForProject: GetProjectTranscript;
  };
  clips: {
    listForProject: ListProjectClips;
  };
  editor: {
    open: GetClipEditor;
    save: SaveEditingScript;
  };
  reframe: {
    get: GetClipReframe;
    start: StartClipReframe;
  };
  broll: {
    getPlan: GetBrollPlan;
    startPlan: StartBrollPlan;
    search: SearchStockVideos;
  };
  social: {
    getPostCopy: GetPostCopy;
    startPostCopy: StartPostCopy;
  };
  render: {
    start: StartClipRender;
    openOutput: OpenRenderOutput;
  };
  settings: {
    overview: GetSettingsOverview;
    save: SavePreferences;
  };
}

// Hanya koneksi DB yang dibagi lewat globalThis: hot reload & bundle per-route Next.js (dev)
// tidak membuka koneksi berulang. Container dibuat per bundle, sehingga class (mis. error domain)
// yang dipakai use case sama dengan yang diimpor route, dan perubahan kode langsung berlaku.
const globalForDb = globalThis as { __clipstudioDb?: Promise<Database> };

function sharedDatabase(config: AppConfig): Promise<Database> {
  globalForDb.__clipstudioDb ??= openDatabase(
    config.databaseUrl,
    config.dataDir,
  ).catch((error: unknown) => {
    globalForDb.__clipstudioDb = undefined;
    throw error;
  });
  return globalForDb.__clipstudioDb;
}

async function build(): Promise<Container> {
  const config = loadConfig();
  const db = await sharedDatabase(config);
  const jobRepository = new DrizzleJobRepository(db);
  const enqueueJob = new EnqueueJob(jobRepository);
  const projectRepository = new DrizzleProjectRepository(db);
  const mediaStorage = new LocalMediaStorage(config.dataDir);
  const projectJobs = new GetProjectJobs(jobRepository);
  const clipRepository = new DrizzleClipRepository(db);
  const transcriptRepository = new DrizzleTranscriptRepository(db);
  const editingScriptRepository = new DrizzleEditingScriptRepository(db);
  const getJob = new GetJob(jobRepository);
  const cropTracks = new GetClipCropTracks(
    new DrizzleClipReframeRepository(db),
  );
  const openEditor = new GetClipEditor(
    clipRepository,
    transcriptRepository,
    editingScriptRepository,
    cropTracks,
  );
  const listJobs = new ListJobs(jobRepository);
  const getReframe = new GetClipReframe(clipRepository, cropTracks, listJobs);
  const getBrollPlan = new GetBrollPlan(clipRepository, listJobs);
  const getPostCopy = new GetPostCopy(clipRepository, listJobs);
  const settingsRepository = new DrizzleSettingsRepository(db);
  const workerOnline = new CheckWorkerOnline(settingsRepository, systemClock);
  return {
    config,
    jobs: {
      enqueue: enqueueJob,
      get: getJob,
      list: listJobs,
      retry: new RetryJob(jobRepository),
    },
    projects: {
      upload: new UploadVideo(
        projectRepository,
        mediaStorage,
        enqueueJob,
        uuidGenerator,
        systemClock,
      ),
      importFromUrl: new ImportVideoFromUrl(
        projectRepository,
        enqueueJob,
        uuidGenerator,
        systemClock,
      ),
      list: new ListProjects(
        projectRepository,
        projectJobs,
        new GetClipStats(clipRepository),
      ),
      get: new GetProject(projectRepository, projectJobs),
      rediscover: new RequestClipDiscovery(
        projectRepository,
        projectJobs,
        enqueueJob,
      ),
      openProxy: new OpenProxyVideo(projectRepository, mediaStorage),
      openThumbnail: new OpenThumbnail(projectRepository, mediaStorage),
      delete: new DeleteProject(projectRepository, mediaStorage, {
        isOnline: () => workerOnline.execute(),
      }),
      storage: new GetStorageOverview(mediaStorage),
    },
    transcripts: {
      getForProject: new GetProjectTranscript(transcriptRepository),
    },
    clips: {
      listForProject: new ListProjectClips(clipRepository),
    },
    editor: {
      open: openEditor,
      save: new SaveEditingScript(
        clipRepository,
        transcriptRepository,
        editingScriptRepository,
      ),
    },
    reframe: {
      get: getReframe,
      start: new StartClipReframe(clipRepository, getReframe, enqueueJob),
    },
    broll: {
      getPlan: getBrollPlan,
      startPlan: new StartBrollPlan(openEditor, getBrollPlan, enqueueJob),
      search: new SearchStockVideos(
        config.pixabayApiKey
          ? new CachingStockVideoSearch(
              new PixabayVideoSearch(config.pixabayApiKey),
              systemClock,
            )
          : null,
      ),
    },
    social: {
      getPostCopy,
      startPostCopy: new StartPostCopy(openEditor, getPostCopy, enqueueJob),
    },
    render: {
      start: new StartClipRender(
        openEditor,
        projectRepository,
        enqueueJob,
        getReframe,
      ),
      openOutput: new OpenRenderOutput(getJob, clipRepository, mediaStorage),
    },
    settings: {
      overview: new GetSettingsOverview(
        settingsRepository,
        new GetPreferences(settingsRepository),
        { pixabay: config.pixabayApiKey !== null },
        systemClock,
      ),
      save: new SavePreferences(settingsRepository),
    },
  };
}

let container: Promise<Container> | undefined;

export function getContainer(): Promise<Container> {
  container ??= build().catch((error: unknown) => {
    container = undefined;
    throw error;
  });
  return container;
}
