use std::{
    collections::HashMap,
    fs,
    fs::File,
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
    },
    thread,
    time::Duration,
};

use bzip2::read::BzDecoder;
use rodio::{Sink, buffer::SamplesBuffer};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sherpa_onnx::{
    GenerationConfig, OfflineTts, OfflineTtsConfig, OfflineTtsSupertonicModelConfig,
    OfflineTtsVitsModelConfig,
};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
use tokio::io::AsyncWriteExt;

const EVENT_VOICE_PACK: &str = "buddy://voice-pack";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum VoiceEngineKind {
    Vits {
        model: &'static str,
        tokens: &'static str,
        data_dir: &'static str,
    },
    Supertonic,
}

impl VoiceEngineKind {
    const fn label(self) -> &'static str {
        match self {
            Self::Vits { .. } => "Piper VITS",
            Self::Supertonic => "Supertonic 3",
        }
    }
}

#[derive(Debug, Clone, Copy)]
struct VoicePackSpec {
    locale: &'static str,
    id: &'static str,
    version: &'static str,
    name: &'static str,
    archive_file: &'static str,
    extracted_dir: &'static str,
    url: &'static str,
    sha256: &'static str,
    download_bytes: u64,
    required_files: &'static [&'static str],
    engine: VoiceEngineKind,
    license: &'static str,
    license_url: &'static str,
}

const PIPER_VI_FILES: &[&str] = &["vi_VN-vais1000-medium.onnx", "tokens.txt", "espeak-ng-data"];
const PIPER_EN_FILES: &[&str] = &["en_US-ljspeech-medium.onnx", "tokens.txt", "espeak-ng-data"];
const SUPERTONIC_FILES: &[&str] = &[
    "duration_predictor.int8.onnx",
    "text_encoder.int8.onnx",
    "vector_estimator.int8.onnx",
    "vocoder.int8.onnx",
    "tts.json",
    "unicode_indexer.bin",
    "voice.bin",
];

const SUPERTONIC_SPEC: VoicePackSpec = VoicePackSpec {
    locale: "ko",
    id: "supertonic-3-int8-2026-05-11",
    version: "2026-05-11",
    name: "Supertonic 3 multilingual",
    archive_file: "sherpa-onnx-supertonic-3-tts-int8-2026-05-11.tar.bz2",
    extracted_dir: "sherpa-onnx-supertonic-3-tts-int8-2026-05-11",
    url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/sherpa-onnx-supertonic-3-tts-int8-2026-05-11.tar.bz2",
    sha256: "82fa96f91c4ef8abaae3a14a3f4153facf88bed821d1f7331cec2700f432c427",
    download_bytes: 128_774_318,
    required_files: SUPERTONIC_FILES,
    engine: VoiceEngineKind::Supertonic,
    license: "OpenRAIL-M",
    license_url: "https://huggingface.co/Supertone/supertonic-3/blob/main/LICENSE",
};

const VOICE_PACKS: [VoicePackSpec; 4] = [
    VoicePackSpec {
        locale: "vi",
        id: "piper-vi-vais1000-medium",
        version: "1",
        name: "Tiếng Việt · VAIS-1000",
        archive_file: "vits-piper-vi_VN-vais1000-medium.tar.bz2",
        extracted_dir: "vits-piper-vi_VN-vais1000-medium",
        url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-vi_VN-vais1000-medium.tar.bz2",
        sha256: "fa1367710767d36ed5cf13b4a449e20c35ffd12791c2e47c2e64142bfa55551a",
        download_bytes: 67_154_040,
        required_files: PIPER_VI_FILES,
        engine: VoiceEngineKind::Vits {
            model: "vi_VN-vais1000-medium.onnx",
            tokens: "tokens.txt",
            data_dir: "espeak-ng-data",
        },
        license: "MIT model · CC BY 4.0 corpus",
        license_url: "https://huggingface.co/rhasspy/piper-voices/blob/main/vi/vi_VN/vais1000/medium/MODEL_CARD",
    },
    VoicePackSpec {
        locale: "en",
        id: "piper-en-ljspeech-medium",
        version: "1",
        name: "English · LJSpeech",
        archive_file: "vits-piper-en_US-ljspeech-medium.tar.bz2",
        extracted_dir: "vits-piper-en_US-ljspeech-medium",
        url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-ljspeech-medium.tar.bz2",
        sha256: "3dfb4b759d8be032a4903a9538d128b0fda2a06ab1de6cbc2d93a97e2dd83dba",
        download_bytes: 67_169_893,
        required_files: PIPER_EN_FILES,
        engine: VoiceEngineKind::Vits {
            model: "en_US-ljspeech-medium.onnx",
            tokens: "tokens.txt",
            data_dir: "espeak-ng-data",
        },
        license: "MIT model · public-domain corpus",
        license_url: "https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/ljspeech/medium/MODEL_CARD",
    },
    SUPERTONIC_SPEC,
    VoicePackSpec {
        locale: "ja",
        ..SUPERTONIC_SPEC
    },
];

fn pack_for_locale(locale: &str) -> Option<&'static VoicePackSpec> {
    VOICE_PACKS.iter().find(|spec| spec.locale == locale)
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VoicePackStatus {
    state: VoicePackState,
    locale: &'static str,
    id: &'static str,
    version: &'static str,
    name: &'static str,
    engine: &'static str,
    license: &'static str,
    license_url: &'static str,
    downloaded_bytes: u64,
    total_bytes: u64,
    error: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum VoicePackState {
    Missing,
    Downloading,
    Installing,
    Ready,
    Error,
}

impl VoicePackStatus {
    fn new(spec: &'static VoicePackSpec, state: VoicePackState) -> Self {
        let ready = state == VoicePackState::Ready;
        Self {
            state,
            locale: spec.locale,
            id: spec.id,
            version: spec.version,
            name: spec.name,
            engine: spec.engine.label(),
            license: spec.license,
            license_url: spec.license_url,
            downloaded_bytes: if ready { spec.download_bytes } else { 0 },
            total_bytes: spec.download_bytes,
            error: None,
        }
    }

    fn missing(spec: &'static VoicePackSpec) -> Self {
        Self::new(spec, VoicePackState::Missing)
    }

    fn ready(spec: &'static VoicePackSpec) -> Self {
        Self::new(spec, VoicePackState::Ready)
    }
}

struct LoadedEngine {
    pack_id: &'static str,
    tts: OfflineTts,
}

struct VoicePackInner {
    statuses: Mutex<HashMap<&'static str, VoicePackStatus>>,
    active_install: Mutex<Option<&'static str>>,
    engine: Mutex<Option<LoadedEngine>>,
    playback_generation: AtomicU64,
}

#[derive(Clone)]
pub struct VoicePackManager {
    inner: Arc<VoicePackInner>,
}

impl Default for VoicePackManager {
    fn default() -> Self {
        Self {
            inner: Arc::new(VoicePackInner {
                statuses: Mutex::new(HashMap::new()),
                active_install: Mutex::new(None),
                engine: Mutex::new(None),
                playback_generation: AtomicU64::new(0),
            }),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeakDialogueRequest {
    text: String,
    locale: String,
    pet_id: String,
    volume: u8,
}

struct VoicePlayback {
    text: String,
    locale: String,
    speaker: i32,
    speed: f32,
    volume: u8,
}

fn voice_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("voice-packs"))
        .map_err(|_| "voicePackDataDirectoryUnavailable".to_owned())
}

fn installed_model_dir(app: &AppHandle, spec: &VoicePackSpec) -> Result<PathBuf, String> {
    Ok(voice_root(app)?.join(spec.id))
}

fn model_is_valid(spec: &VoicePackSpec, path: &Path) -> bool {
    path.is_dir()
        && spec.required_files.iter().all(|name| {
            let candidate = path.join(name);
            if *name == "espeak-ng-data" {
                candidate.is_dir()
            } else {
                candidate.is_file()
            }
        })
}

fn publish_status(app: &AppHandle, manager: &VoicePackManager, status: VoicePackStatus) {
    if let Ok(mut statuses) = manager.inner.statuses.lock() {
        statuses.insert(status.locale, status.clone());
    }
    let _ = app.emit(EVENT_VOICE_PACK, status);
}

fn require_settings_window(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "settings" {
        Ok(())
    } else {
        Err("voicePackSettingsWindowOnly".to_owned())
    }
}

fn begin_install(manager: &VoicePackManager, spec: &'static VoicePackSpec) -> Result<(), String> {
    let mut active = manager
        .inner
        .active_install
        .lock()
        .map_err(|_| "voicePackStateUnavailable".to_owned())?;
    if active.is_some() {
        return Err("voicePackAnotherDownloadInProgress".to_owned());
    }
    *active = Some(spec.id);
    Ok(())
}

fn finish_install(manager: &VoicePackManager, spec: &VoicePackSpec) {
    if let Ok(mut active) = manager.inner.active_install.lock()
        && *active == Some(spec.id)
    {
        *active = None;
    }
}

#[tauri::command]
pub fn get_voice_pack_status(
    app: AppHandle,
    window: WebviewWindow,
    manager: State<'_, VoicePackManager>,
    locale: String,
) -> Result<VoicePackStatus, String> {
    require_settings_window(&window)?;
    let spec = pack_for_locale(&locale).ok_or_else(|| "voiceLocaleUnsupported".to_owned())?;
    if installed_model_dir(&app, spec)
        .map(|path| model_is_valid(spec, &path))
        .unwrap_or(false)
    {
        let status = VoicePackStatus::ready(spec);
        if let Ok(mut statuses) = manager.inner.statuses.lock() {
            statuses.insert(spec.locale, status.clone());
        }
        return Ok(status);
    }
    Ok(manager
        .inner
        .statuses
        .lock()
        .ok()
        .and_then(|statuses| statuses.get(spec.locale).cloned())
        .unwrap_or_else(|| VoicePackStatus::missing(spec)))
}

#[tauri::command]
pub async fn install_voice_pack(
    app: AppHandle,
    window: WebviewWindow,
    manager: State<'_, VoicePackManager>,
    locale: String,
) -> Result<VoicePackStatus, String> {
    require_settings_window(&window)?;
    let spec = pack_for_locale(&locale).ok_or_else(|| "voiceLocaleUnsupported".to_owned())?;
    let manager = manager.inner().clone();
    if model_is_valid(spec, &installed_model_dir(&app, spec)?) {
        return Ok(VoicePackStatus::ready(spec));
    }
    begin_install(&manager, spec)?;

    let root = match voice_root(&app) {
        Ok(root) => root,
        Err(error) => {
            finish_install(&manager, spec);
            return Err(error);
        }
    };
    if tokio::fs::create_dir_all(&root).await.is_err() {
        finish_install(&manager, spec);
        return Err("voicePackDirectoryCreateFailed".to_owned());
    }
    let archive_path = root.join(format!("{}.download", spec.archive_file));
    let staging_path = root.join(format!(".{}-installing", spec.id));
    let final_path = root.join(spec.id);
    publish_status(
        &app,
        &manager,
        VoicePackStatus::new(spec, VoicePackState::Downloading),
    );

    let result = async {
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(300))
            .build()
            .map_err(|_| "voicePackDownloadFailed")?;
        let response = client
            .get(spec.url)
            .send()
            .await
            .map_err(|_| "voicePackDownloadFailed")?
            .error_for_status()
            .map_err(|_| "voicePackDownloadFailed")?;
        let total = response.content_length().unwrap_or(spec.download_bytes);
        let mut file = tokio::fs::File::create(&archive_path)
            .await
            .map_err(|_| "voicePackDownloadFileFailed")?;
        let mut response = response;
        let mut downloaded = 0_u64;
        let mut last_published = 0_u64;
        let mut hasher = Sha256::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| "voicePackDownloadFailed")?
        {
            file.write_all(&chunk)
                .await
                .map_err(|_| "voicePackDownloadFileFailed")?;
            hasher.update(&chunk);
            downloaded += chunk.len() as u64;
            if downloaded.saturating_sub(last_published) >= 256 * 1_024 || downloaded == total {
                let mut status = VoicePackStatus::new(spec, VoicePackState::Downloading);
                status.downloaded_bytes = downloaded;
                status.total_bytes = total;
                publish_status(&app, &manager, status);
                last_published = downloaded;
            }
        }
        file.flush()
            .await
            .map_err(|_| "voicePackDownloadFileFailed")?;
        drop(file);
        if format!("{:x}", hasher.finalize()) != spec.sha256 {
            return Err("voicePackChecksumMismatch");
        }

        let mut installing = VoicePackStatus::new(spec, VoicePackState::Installing);
        installing.downloaded_bytes = downloaded;
        installing.total_bytes = total;
        publish_status(&app, &manager, installing);
        let archive_for_task = archive_path.clone();
        let staging_for_task = staging_path.clone();
        let final_for_task = final_path.clone();
        tauri::async_runtime::spawn_blocking(move || {
            install_archive(spec, &archive_for_task, &staging_for_task, &final_for_task)
        })
        .await
        .map_err(|_| "voicePackInstallFailed")??;
        Ok::<(), &'static str>(())
    }
    .await;

    finish_install(&manager, spec);
    if let Err(error) = result {
        let _ = tokio::fs::remove_file(&archive_path).await;
        let _ = tokio::fs::remove_dir_all(&staging_path).await;
        let mut status = VoicePackStatus::new(spec, VoicePackState::Error);
        status.error = Some(error.to_owned());
        publish_status(&app, &manager, status);
        return Err(error.to_owned());
    }

    if let Ok(mut engine) = manager.inner.engine.lock() {
        *engine = None;
    }
    let status = VoicePackStatus::ready(spec);
    publish_status(&app, &manager, status.clone());
    Ok(status)
}

fn install_archive(
    spec: &VoicePackSpec,
    archive_path: &Path,
    staging: &Path,
    destination: &Path,
) -> Result<(), &'static str> {
    if staging.exists() {
        fs::remove_dir_all(staging).map_err(|_| "voicePackInstallFailed")?;
    }
    fs::create_dir_all(staging).map_err(|_| "voicePackInstallFailed")?;
    let file = File::open(archive_path).map_err(|_| "voicePackInstallFailed")?;
    let mut archive = tar::Archive::new(BzDecoder::new(file));
    archive
        .unpack(staging)
        .map_err(|_| "voicePackInstallFailed")?;
    let extracted = staging.join(spec.extracted_dir);
    if !model_is_valid(spec, &extracted) {
        return Err("voicePackFilesInvalid");
    }
    if destination.exists() {
        fs::remove_dir_all(destination).map_err(|_| "voicePackInstallFailed")?;
    }
    fs::rename(&extracted, destination).map_err(|_| "voicePackInstallFailed")?;
    fs::remove_dir_all(staging).map_err(|_| "voicePackInstallFailed")?;
    fs::remove_file(archive_path).map_err(|_| "voicePackInstallFailed")?;
    Ok(())
}

#[tauri::command]
pub async fn speak_dialogue(
    app: AppHandle,
    manager: State<'_, VoicePackManager>,
    request: SpeakDialogueRequest,
) -> Result<bool, String> {
    let text = request.text.trim().to_owned();
    if text.is_empty() || text.chars().count() > 360 || request.volume > 100 {
        return Err("voiceRequestInvalid".to_owned());
    }
    let spec =
        pack_for_locale(&request.locale).ok_or_else(|| "voiceLocaleUnsupported".to_owned())?;
    let (speaker, speed) = match request.pet_id.as_str() {
        "goat10" => (2, 1.04),
        "camel7" => (6, 0.94),
        "memeCat" => (8, 1.02),
        "shiba" => (3, 1.08),
        _ => return Err("voiceBuddyUnsupported".to_owned()),
    };
    let model_dir = installed_model_dir(&app, spec)?;
    if !model_is_valid(spec, &model_dir) {
        return Ok(false);
    }
    let inner = manager.inner.clone();
    let generation = inner.playback_generation.fetch_add(1, Ordering::Relaxed) + 1;
    let playback = VoicePlayback {
        text,
        locale: request.locale,
        speaker,
        speed,
        volume: request.volume,
    };
    tauri::async_runtime::spawn_blocking(move || {
        generate_and_play(inner, generation, spec, &model_dir, playback)
    })
    .await
    .map_err(|_| "voiceSynthesisFailed".to_owned())?
}

#[tauri::command]
pub fn stop_dialogue(manager: State<'_, VoicePackManager>) {
    manager
        .inner
        .playback_generation
        .fetch_add(1, Ordering::Relaxed);
}

fn generate_and_play(
    inner: Arc<VoicePackInner>,
    generation: u64,
    spec: &'static VoicePackSpec,
    model_dir: &Path,
    playback: VoicePlayback,
) -> Result<bool, String> {
    let mut engine = inner
        .engine
        .lock()
        .map_err(|_| "voiceEngineUnavailable".to_owned())?;
    if engine
        .as_ref()
        .is_none_or(|loaded| loaded.pack_id != spec.id)
    {
        *engine = Some(LoadedEngine {
            pack_id: spec.id,
            tts: create_engine(spec, model_dir)
                .ok_or_else(|| "voiceEngineLoadFailed".to_owned())?,
        });
    }
    let mut config = GenerationConfig {
        sid: if matches!(spec.engine, VoiceEngineKind::Vits { .. }) {
            0
        } else {
            playback.speaker
        },
        speed: playback.speed,
        ..Default::default()
    };
    if matches!(spec.engine, VoiceEngineKind::Supertonic) {
        let mut extra = HashMap::new();
        extra.insert("lang".to_owned(), serde_json::json!(playback.locale));
        config.num_steps = 8;
        config.extra = Some(extra);
    }
    let callback_inner = inner.clone();
    let generated = engine
        .as_ref()
        .and_then(|loaded| {
            loaded.tts.generate_with_config(
                &playback.text,
                &config,
                Some(move |_samples: &[f32], _progress: f32| {
                    callback_inner.playback_generation.load(Ordering::Relaxed) == generation
                }),
            )
        })
        .ok_or_else(|| "voiceSynthesisFailed".to_owned())?;
    let samples = generated.samples().to_vec();
    let sample_rate = generated.sample_rate() as u32;
    drop(generated);
    drop(engine);

    if inner.playback_generation.load(Ordering::Relaxed) != generation {
        return Ok(true);
    }

    let stream = rodio::OutputStreamBuilder::open_default_stream()
        .map_err(|_| "voiceOutputUnavailable".to_owned())?;
    let sink = Sink::connect_new(stream.mixer());
    sink.set_volume(f32::from(playback.volume) / 100.0);
    sink.append(SamplesBuffer::new(1, sample_rate, samples));
    while !sink.empty() {
        if inner.playback_generation.load(Ordering::Relaxed) != generation {
            sink.stop();
            break;
        }
        thread::sleep(Duration::from_millis(20));
    }
    Ok(true)
}

fn create_engine(spec: &VoicePackSpec, model_dir: &Path) -> Option<OfflineTts> {
    let model_path = |name: &str| Some(model_dir.join(name).to_string_lossy().into_owned());
    let mut model = sherpa_onnx::OfflineTtsModelConfig {
        num_threads: 2,
        debug: false,
        ..Default::default()
    };
    match spec.engine {
        VoiceEngineKind::Vits {
            model: model_file,
            tokens,
            data_dir,
        } => {
            model.vits = OfflineTtsVitsModelConfig {
                model: model_path(model_file),
                tokens: model_path(tokens),
                data_dir: model_path(data_dir),
                ..Default::default()
            };
        }
        VoiceEngineKind::Supertonic => {
            model.supertonic = OfflineTtsSupertonicModelConfig {
                duration_predictor: model_path("duration_predictor.int8.onnx"),
                text_encoder: model_path("text_encoder.int8.onnx"),
                vector_estimator: model_path("vector_estimator.int8.onnx"),
                vocoder: model_path("vocoder.int8.onnx"),
                tts_json: model_path("tts.json"),
                unicode_indexer: model_path("unicode_indexer.bin"),
                voice_style: model_path("voice.bin"),
            };
        }
    }
    OfflineTts::create(&OfflineTtsConfig {
        model,
        ..Default::default()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_has_one_pack_for_every_supported_locale() {
        assert_eq!(
            VOICE_PACKS.map(|pack| pack.locale),
            ["vi", "en", "ko", "ja"]
        );
        assert!(matches!(
            pack_for_locale("vi").unwrap().engine,
            VoiceEngineKind::Vits { .. }
        ));
        assert!(matches!(
            pack_for_locale("en").unwrap().engine,
            VoiceEngineKind::Vits { .. }
        ));
        assert!(matches!(
            pack_for_locale("ko").unwrap().engine,
            VoiceEngineKind::Supertonic
        ));
        assert!(matches!(
            pack_for_locale("ja").unwrap().engine,
            VoiceEngineKind::Supertonic
        ));
    }

    #[test]
    fn model_validation_requires_every_runtime_file() {
        let directory = tempfile::tempdir().unwrap();
        let spec = pack_for_locale("vi").unwrap();
        assert!(!model_is_valid(spec, directory.path()));
        for name in spec.required_files {
            let path = directory.path().join(name);
            if *name == "espeak-ng-data" {
                fs::create_dir(path).unwrap();
            } else {
                File::create(path).unwrap();
            }
        }
        assert!(model_is_valid(spec, directory.path()));
    }

    #[test]
    fn every_download_is_https_and_checksum_pinned() {
        for spec in VOICE_PACKS {
            assert_eq!(spec.sha256.len(), 64);
            assert!(
                spec.url
                    .starts_with("https://github.com/k2-fsa/sherpa-onnx/releases/")
            );
            assert!(!spec.license.is_empty());
            assert!(spec.license_url.starts_with("https://"));
        }
    }

    #[test]
    #[ignore = "requires the optional locale voice pack"]
    fn installed_pack_generates_audio() {
        let locale = std::env::var("BUDDYPET_VOICE_TEST_LOCALE").unwrap_or_else(|_| "vi".into());
        let path = std::env::var("BUDDYPET_VOICE_PACK_TEST_DIR").unwrap();
        let spec = pack_for_locale(&locale).unwrap();
        let engine = create_engine(spec, Path::new(&path)).expect("load locale voice pack");
        let text = if locale == "vi" {
            "Ê, nghỉ tay một chút rồi quay lại quậy tiếp nhé!"
        } else {
            "Your Buddy is ready to cause some harmless trouble."
        };
        let audio = engine
            .generate_with_config(
                text,
                &GenerationConfig {
                    sid: 0,
                    speed: 1.02,
                    ..Default::default()
                },
                None::<fn(&[f32], f32) -> bool>,
            )
            .expect("generate audio");
        assert_eq!(audio.sample_rate(), engine.sample_rate());
        assert!(audio.samples().len() > audio.sample_rate() as usize / 2);
    }
}
