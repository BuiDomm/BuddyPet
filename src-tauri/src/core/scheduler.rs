use std::{collections::HashSet, time::Duration};

use chrono::{DateTime, NaiveDate, TimeDelta, Utc};
use rand::{Rng, SeedableRng, rngs::StdRng};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

use super::{
    ActionManifest, ActiveStreakTracker, ActivitySnapshot, BehaviorCategory, EpisodePlan,
    EpisodeRecord, EpisodeTrigger, FullscreenState, Intensity, LogicalPoint, LogicalRect,
    MonitorSnapshot, PetId, PowerMode, RendererEvent, RuntimeStateV1, SessionState, SettingsError,
    SettingsV1,
};

const STARTUP_GRACE: Duration = Duration::from_secs(5 * 60);
const MAX_EPISODE_DURATION: Duration = Duration::from_secs(12);
const MAX_REACTION_DURATION: Duration = Duration::from_secs(5);
const EMERGENCY_SNOOZE: Duration = Duration::from_secs(30 * 60);
const ADAPTIVE_DOWNSHIFT: Duration = Duration::from_secs(24 * 60 * 60);
const FOUR_HOURS: Duration = Duration::from_secs(4 * 60 * 60);
const INPUT_RECENCY_REQUIRED: Duration = Duration::from_secs(60);
const SAFETY_RETRY: Duration = Duration::from_secs(30);
const MAX_CAPTURE_WIDTH: u32 = 640;
const MAX_CAPTURE_HEIGHT: u32 = 480;
const MAX_CAPTURE_PHYSICAL_PIXELS: u64 = 1_500_000;
const MAX_EFFECT_AREA_PERCENT: u64 = 12;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PresetPolicy {
    pub focus_nudge_after: Duration,
    pub random_min: Duration,
    pub random_max: Duration,
    pub cooldown: Duration,
    pub max_rolling_four_hours: usize,
    pub max_daily: usize,
}

impl Intensity {
    pub const fn policy(self) -> PresetPolicy {
        match self {
            Self::Gentle => PresetPolicy {
                focus_nudge_after: Duration::from_secs(60 * 60),
                random_min: Duration::from_secs(90 * 60),
                random_max: Duration::from_secs(150 * 60),
                cooldown: Duration::from_secs(45 * 60),
                max_rolling_four_hours: 2,
                max_daily: 4,
            },
            Self::Playful => PresetPolicy {
                focus_nudge_after: Duration::from_secs(50 * 60),
                random_min: Duration::from_secs(45 * 60),
                random_max: Duration::from_secs(90 * 60),
                cooldown: Duration::from_secs(20 * 60),
                max_rolling_four_hours: 3,
                max_daily: 6,
            },
            Self::Chaos => PresetPolicy {
                focus_nudge_after: Duration::from_secs(40 * 60),
                random_min: Duration::from_secs(25 * 60),
                random_max: Duration::from_secs(50 * 60),
                cooldown: Duration::from_secs(12 * 60),
                max_rolling_four_hours: 4,
                max_daily: 8,
            },
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum DirectorPhase {
    Dormant,
    SafetyCheck,
    Enter,
    Mischief,
    Reaction,
    Exit,
    Cooldown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum SafetyBlock {
    Busy,
    Paused,
    Snoozed,
    MeetingMode,
    QuietHours,
    SessionUnavailable,
    Fullscreen,
    StartupOrResumeGrace,
    UserInactive,
    PointerUnavailable,
    PointerBusy,
    Cooldown,
    RollingBudget,
    DailyBudget,
    NoMonitor,
    NoActions,
    NoSafeAnchor,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum ReactionKind {
    StartledAndRelocate,
    Petted,
    DragReleased,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum HideReason {
    Completed,
    UserDismissed,
    EmergencyHide,
    SessionChanged,
    TimedOut,
    RendererFailed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum DirectorCommand {
    Blocked {
        reason: SafetyBlock,
    },
    Start {
        plan: EpisodePlan,
    },
    SetPhase {
        event_id: String,
        phase: DirectorPhase,
    },
    React {
        event_id: String,
        reaction: ReactionKind,
        #[serde(default)]
        relocate_to: Option<LogicalRect>,
    },
    Hide {
        event_id: String,
        reason: HideReason,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EpisodeOutcome {
    Completed,
    UserDismissed,
    EmergencyHide,
    SessionChanged,
    TimedOut,
    RendererFailed,
}

impl EpisodeOutcome {
    fn dismissed_early(self) -> bool {
        matches!(self, Self::UserDismissed | Self::EmergencyHide)
    }

    fn hide_reason(self) -> HideReason {
        match self {
            Self::Completed => HideReason::Completed,
            Self::UserDismissed => HideReason::UserDismissed,
            Self::EmergencyHide => HideReason::EmergencyHide,
            Self::SessionChanged => HideReason::SessionChanged,
            Self::TimedOut => HideReason::TimedOut,
            Self::RendererFailed => HideReason::RendererFailed,
        }
    }
}

pub struct DirectorContext<'a> {
    pub now: DateTime<Utc>,
    pub local_date: NaiveDate,
    /// Local wall-clock minute in `0..1440`.
    pub local_minute: u16,
    pub activity: &'a ActivitySnapshot,
    pub monitors: &'a [MonitorSnapshot],
    pub actions: &'a [ActionManifest],
}

#[derive(Debug, Error)]
pub enum DirectorError {
    #[error(transparent)]
    Settings(#[from] SettingsError),
    #[error("runtime schema version {0} is unsupported")]
    UnsupportedRuntimeSchema(u16),
    #[error("local minute must be less than 1440")]
    InvalidLocalMinute,
}

#[derive(Debug, Clone)]
struct ActiveEpisode {
    plan: EpisodePlan,
    work_area: LogicalRect,
    started_at: DateTime<Utc>,
    phase_started_at: DateTime<Utc>,
    first_click_at: Option<DateTime<Utc>>,
}

pub struct BehaviorDirector {
    settings: SettingsV1,
    runtime: RuntimeStateV1,
    phase: DirectorPhase,
    active: Option<ActiveEpisode>,
    streak: ActiveStreakTracker,
    safe_since: DateTime<Utc>,
    safety_retry_at: Option<DateTime<Utc>>,
    rng: StdRng,
}

impl BehaviorDirector {
    pub fn new(
        settings: SettingsV1,
        mut runtime: RuntimeStateV1,
        now: DateTime<Utc>,
        seed: u64,
    ) -> Result<Self, DirectorError> {
        let settings = settings.normalized()?;
        if runtime.schema_version != super::persistence::RUNTIME_STATE_SCHEMA_VERSION {
            return Err(DirectorError::UnsupportedRuntimeSchema(
                runtime.schema_version,
            ));
        }
        runtime.recent_dismissals = runtime
            .recent_dismissals
            .into_iter()
            .rev()
            .take(3)
            .collect::<Vec<_>>();
        runtime.recent_dismissals.reverse();

        let phase = if runtime.cooldown_until.is_some_and(|until| until > now) {
            DirectorPhase::Cooldown
        } else {
            DirectorPhase::Dormant
        };
        let mut director = Self {
            settings,
            runtime,
            phase,
            active: None,
            streak: ActiveStreakTracker::default(),
            safe_since: now,
            safety_retry_at: None,
            rng: StdRng::seed_from_u64(seed),
        };
        if director.runtime.next_random_at.is_none() {
            director.schedule_next_random(now);
        }
        Ok(director)
    }

    pub fn settings(&self) -> &SettingsV1 {
        &self.settings
    }

    pub fn runtime_state(&self) -> &RuntimeStateV1 {
        &self.runtime
    }

    pub fn phase(&self) -> DirectorPhase {
        self.phase
    }

    pub fn active_plan(&self) -> Option<&EpisodePlan> {
        self.active.as_ref().map(|active| &active.plan)
    }

    pub fn active_streak(&self) -> Duration {
        self.streak.streak()
    }

    pub fn update_settings(
        &mut self,
        settings: SettingsV1,
        now: DateTime<Utc>,
    ) -> Result<(), DirectorError> {
        let previous_intensity = self.settings.intensity;
        self.settings = settings.normalized()?;
        if self.settings.intensity != previous_intensity {
            self.schedule_next_random(now);
        }
        Ok(())
    }

    pub fn set_paused(&mut self, paused: bool) {
        self.runtime.paused = paused;
    }

    pub fn snooze_until(&mut self, until: Option<DateTime<Utc>>) {
        self.runtime.snoozed_until = until;
    }

    pub fn set_meeting_mode_until(&mut self, until: Option<DateTime<Utc>>) {
        self.settings.meeting_mode_until = until;
    }

    /// Must be called on startup, login, unlock and wake. Existing episodes are
    /// hidden by the shell; the director then enforces a fresh five-minute grace.
    pub fn mark_resumed(&mut self, now: DateTime<Utc>) -> Vec<DirectorCommand> {
        self.safe_since = now;
        self.streak.reset();
        self.safety_retry_at = None;
        if self.active.is_some() {
            vec![self.finish_episode(now, EpisodeOutcome::SessionChanged)]
        } else {
            self.phase = DirectorPhase::Dormant;
            Vec::new()
        }
    }

    /// Evaluates automatic focus/random triggers. The host should call this
    /// approximately every ten seconds and persist `runtime_state()` after a
    /// non-empty command list.
    pub fn tick(
        &mut self,
        context: &DirectorContext<'_>,
    ) -> Result<Vec<DirectorCommand>, DirectorError> {
        self.validate_context(context)?;
        self.prune_history(context.now);
        self.streak.observe(context.now, context.activity);

        if let Some(active) = &self.active {
            let elapsed = nonnegative_elapsed(context.now, active.started_at);
            if elapsed >= MAX_EPISODE_DURATION {
                return Ok(vec![
                    self.finish_episode(context.now, EpisodeOutcome::TimedOut),
                ]);
            }
            if self.phase == DirectorPhase::Reaction
                && nonnegative_elapsed(context.now, active.phase_started_at)
                    >= MAX_REACTION_DURATION
            {
                let event_id = active.plan.event_id.clone();
                self.phase = DirectorPhase::Exit;
                if let Some(active) = self.active.as_mut() {
                    active.phase_started_at = context.now;
                }
                return Ok(vec![DirectorCommand::SetPhase {
                    event_id,
                    phase: DirectorPhase::Exit,
                }]);
            }
            return Ok(Vec::new());
        }

        if self.phase == DirectorPhase::Cooldown
            && !self
                .runtime
                .cooldown_until
                .is_some_and(|until| until > context.now)
        {
            self.phase = DirectorPhase::Dormant;
        }

        if self
            .safety_retry_at
            .is_some_and(|retry_at| retry_at > context.now)
        {
            return Ok(Vec::new());
        }

        let policy = self.effective_policy(context.now);
        let trigger = if self.streak.streak() >= policy.focus_nudge_after {
            Some(EpisodeTrigger::FocusNudge)
        } else if self
            .runtime
            .next_random_at
            .is_some_and(|next| context.now >= next)
        {
            Some(EpisodeTrigger::Random)
        } else {
            None
        };

        let Some(trigger) = trigger else {
            return Ok(Vec::new());
        };
        Ok(self.try_start(context, trigger, false))
    }

    /// Explicit summon ignores pause, snooze, cooldown and automatic budgets,
    /// but retains privacy/safety gates (lock, fullscreen, meeting, quiet hours,
    /// startup grace and pointer availability).
    pub fn summon(
        &mut self,
        context: &DirectorContext<'_>,
    ) -> Result<Vec<DirectorCommand>, DirectorError> {
        self.validate_context(context)?;
        Ok(self.try_start(context, EpisodeTrigger::Manual, true))
    }

    /// Onboarding-only scripted summon. It bypasses user schedule controls and
    /// quiet hours, while lock/fullscreen/input safety still applies.
    pub fn start_tutorial(
        &mut self,
        context: &DirectorContext<'_>,
    ) -> Result<Vec<DirectorCommand>, DirectorError> {
        self.validate_context(context)?;
        Ok(self.try_start(context, EpisodeTrigger::Tutorial, true))
    }

    pub fn handle_renderer_event(
        &mut self,
        event: RendererEvent,
        now: DateTime<Utc>,
    ) -> Vec<DirectorCommand> {
        let Some(active) = self.active.as_ref() else {
            return Vec::new();
        };
        // This is the central stale-callback guard. A renderer from an older
        // episode has no authority over the current windows.
        if event.event_id() != active.plan.event_id {
            return Vec::new();
        }

        match event {
            RendererEvent::Ready { event_id } => {
                self.phase = DirectorPhase::Enter;
                if let Some(active) = self.active.as_mut() {
                    active.phase_started_at = now;
                }
                vec![DirectorCommand::SetPhase {
                    event_id,
                    phase: DirectorPhase::Enter,
                }]
            }
            RendererEvent::Marker { event_id, marker }
                if marker == "entranceComplete" && self.phase == DirectorPhase::Enter =>
            {
                self.phase = DirectorPhase::Mischief;
                if let Some(active) = self.active.as_mut() {
                    active.phase_started_at = now;
                }
                vec![DirectorCommand::SetPhase {
                    event_id,
                    phase: DirectorPhase::Mischief,
                }]
            }
            RendererEvent::Marker { event_id, marker }
                if marker == "mischiefComplete"
                    && matches!(
                        self.phase,
                        DirectorPhase::Mischief | DirectorPhase::Reaction
                    ) =>
            {
                self.phase = DirectorPhase::Exit;
                if let Some(active) = self.active.as_mut() {
                    active.phase_started_at = now;
                }
                vec![DirectorCommand::SetPhase {
                    event_id,
                    phase: DirectorPhase::Exit,
                }]
            }
            RendererEvent::Marker { marker, .. } if marker == "exitComplete" => {
                vec![self.finish_episode(now, EpisodeOutcome::Completed)]
            }
            RendererEvent::Clicked { event_id } => self.handle_click(event_id, now),
            RendererEvent::Petted { event_id } => {
                self.phase = DirectorPhase::Reaction;
                if let Some(active) = self.active.as_mut() {
                    active.phase_started_at = now;
                }
                vec![DirectorCommand::React {
                    event_id,
                    reaction: ReactionKind::Petted,
                    relocate_to: None,
                }]
            }
            RendererEvent::Dragged { event_id, anchor } => {
                self.phase = DirectorPhase::Reaction;
                let relocate_to = if let Some(active) = self.active.as_mut() {
                    active.phase_started_at = now;
                    let validated = anchor.filter(|candidate| {
                        rect_inside(*candidate, active.work_area) && candidate.area() > 0
                    });
                    if let Some(anchor) = validated {
                        active.plan.anchor_rect = anchor;
                    }
                    validated
                } else {
                    None
                };
                vec![DirectorCommand::React {
                    event_id,
                    reaction: ReactionKind::DragReleased,
                    relocate_to,
                }]
            }
            RendererEvent::Completed { .. } => {
                vec![self.finish_episode(now, EpisodeOutcome::Completed)]
            }
            RendererEvent::Failed { .. } => {
                vec![self.finish_episode(now, EpisodeOutcome::RendererFailed)]
            }
            RendererEvent::PoseChanged { .. } | RendererEvent::Marker { .. } => Vec::new(),
        }
    }

    /// Hides any current episode and enforces the plan's 30-minute emergency
    /// quiet period even when no renderer is currently alive.
    pub fn emergency_hide(&mut self, now: DateTime<Utc>) -> Vec<DirectorCommand> {
        self.runtime.snoozed_until = Some(add_std(now, EMERGENCY_SNOOZE));
        if self.active.is_some() {
            vec![self.finish_episode(now, EpisodeOutcome::EmergencyHide)]
        } else {
            Vec::new()
        }
    }

    /// Applies a temporary, bounded frequency reduction without mutating the
    /// selected intensity preset. If an episode is visible, it is dismissed and
    /// its normal cooldown begins; while idle, only the next random deadline is
    /// recalculated using the reduced-frequency policy.
    pub fn less_of_this(&mut self, now: DateTime<Utc>) -> Vec<DirectorCommand> {
        self.runtime.adaptive_downshift_until = Some(add_std(now, ADAPTIVE_DOWNSHIFT));
        if self.active.is_some() {
            vec![self.finish_episode(now, EpisodeOutcome::UserDismissed)]
        } else {
            self.schedule_next_random(now);
            Vec::new()
        }
    }

    fn validate_context(&self, context: &DirectorContext<'_>) -> Result<(), DirectorError> {
        if context.local_minute >= 1_440 {
            return Err(DirectorError::InvalidLocalMinute);
        }
        Ok(())
    }

    fn try_start(
        &mut self,
        context: &DirectorContext<'_>,
        trigger: EpisodeTrigger,
        explicit: bool,
    ) -> Vec<DirectorCommand> {
        if self.active.is_some() {
            return vec![DirectorCommand::Blocked {
                reason: SafetyBlock::Busy,
            }];
        }

        self.phase = DirectorPhase::SafetyCheck;
        if let Some(reason) = self.safety_block(context, trigger, explicit) {
            self.phase = DirectorPhase::Dormant;
            if !explicit {
                self.safety_retry_at = Some(add_std(context.now, SAFETY_RETRY));
            }
            return vec![DirectorCommand::Blocked { reason }];
        }

        let (plan, work_area, line_key) = match self.build_plan(context, trigger) {
            Ok(planned) => planned,
            Err(reason) => {
                self.phase = DirectorPhase::Dormant;
                if !explicit {
                    self.safety_retry_at = Some(add_std(context.now, SAFETY_RETRY));
                }
                return vec![DirectorCommand::Blocked { reason }];
            }
        };

        self.safety_retry_at = None;
        self.phase = DirectorPhase::Enter;
        self.runtime.episode_history.push(EpisodeRecord {
            started_at: context.now,
            local_date: context.local_date,
            trigger,
            pet_id: plan.pet_id,
            action_id: plan.action_id.clone(),
            line_key,
            dismissed_early: false,
        });
        self.active = Some(ActiveEpisode {
            plan: plan.clone(),
            work_area,
            started_at: context.now,
            phase_started_at: context.now,
            first_click_at: None,
        });
        vec![DirectorCommand::Start { plan }]
    }

    fn safety_block(
        &self,
        context: &DirectorContext<'_>,
        trigger: EpisodeTrigger,
        explicit: bool,
    ) -> Option<SafetyBlock> {
        let tutorial = trigger == EpisodeTrigger::Tutorial;
        if !explicit && self.runtime.paused {
            return Some(SafetyBlock::Paused);
        }
        if !explicit
            && self
                .runtime
                .snoozed_until
                .is_some_and(|until| until > context.now)
        {
            return Some(SafetyBlock::Snoozed);
        }
        if self
            .settings
            .meeting_mode_until
            .is_some_and(|until| until > context.now)
        {
            return Some(SafetyBlock::MeetingMode);
        }
        if !tutorial
            && self
                .settings
                .quiet_hours
                .contains_minute(context.local_minute)
        {
            return Some(SafetyBlock::QuietHours);
        }
        if matches!(
            context.activity.session_state,
            SessionState::Locked | SessionState::Sleeping
        ) {
            return Some(SafetyBlock::SessionUnavailable);
        }
        if matches!(
            context.activity.fullscreen_state,
            FullscreenState::Fullscreen | FullscreenState::Presentation
        ) {
            return Some(SafetyBlock::Fullscreen);
        }
        if !tutorial && nonnegative_elapsed(context.now, self.safe_since) < STARTUP_GRACE {
            return Some(SafetyBlock::StartupOrResumeGrace);
        }
        if Duration::from_millis(context.activity.last_input_age_ms) >= INPUT_RECENCY_REQUIRED {
            return Some(SafetyBlock::UserInactive);
        }
        if context.activity.pointer.is_none() {
            return Some(SafetyBlock::PointerUnavailable);
        }
        if context.activity.mouse_buttons_down {
            return Some(SafetyBlock::PointerBusy);
        }

        if !explicit {
            if self
                .runtime
                .cooldown_until
                .is_some_and(|until| until > context.now)
            {
                return Some(SafetyBlock::Cooldown);
            }
            let policy = self.settings.intensity.policy();
            let rolling_start = subtract_std(context.now, FOUR_HOURS);
            let automatic = |record: &&EpisodeRecord| {
                matches!(
                    record.trigger,
                    EpisodeTrigger::FocusNudge | EpisodeTrigger::Random
                )
            };
            let rolling_count = self
                .runtime
                .episode_history
                .iter()
                .filter(automatic)
                .filter(|record| record.started_at >= rolling_start)
                .count();
            if rolling_count >= policy.max_rolling_four_hours {
                return Some(SafetyBlock::RollingBudget);
            }
            let daily_count = self
                .runtime
                .episode_history
                .iter()
                .filter(automatic)
                .filter(|record| record.local_date == context.local_date)
                .count();
            if daily_count >= policy.max_daily {
                return Some(SafetyBlock::DailyBudget);
            }
        }

        None
    }

    fn build_plan(
        &mut self,
        context: &DirectorContext<'_>,
        trigger: EpisodeTrigger,
    ) -> Result<(EpisodePlan, LogicalRect, String), SafetyBlock> {
        let pointer = context
            .activity
            .pointer
            .ok_or(SafetyBlock::PointerUnavailable)?;
        let monitor = choose_monitor(context.monitors, pointer).ok_or(SafetyBlock::NoMonitor)?;
        let anchor_rect =
            choose_safe_anchor(monitor.work_area, pointer).ok_or(SafetyBlock::NoSafeAnchor)?;

        let eligible = context
            .actions
            .iter()
            .filter(|action| action.validate_structure().is_ok())
            .filter(|action| category_enabled(action.category, &self.settings))
            .filter(|action| {
                self.settings
                    .selected_pets
                    .iter()
                    .any(|pet| action.supports(*pet, trigger))
            })
            .collect::<Vec<_>>();
        if eligible.is_empty() {
            return Err(SafetyBlock::NoActions);
        }

        let pets_with_actions = self
            .settings
            .selected_pets
            .iter()
            .copied()
            .filter(|pet| eligible.iter().any(|action| action.supports(*pet, trigger)))
            .collect::<Vec<_>>();
        let pet = pets_with_actions[self.rng.random_range(0..pets_with_actions.len())];
        let matching = eligible
            .into_iter()
            .filter(|action| action.supports(pet, trigger))
            .collect::<Vec<_>>();

        let recent_lines = self
            .runtime
            .episode_history
            .iter()
            .rev()
            .take(10)
            .filter(|record| !record.line_key.is_empty())
            .map(|record| record.line_key.as_str())
            .collect::<HashSet<_>>();
        let fresh = matching
            .iter()
            .copied()
            .filter(|action| !recent_lines.contains(action.line_key.as_str()))
            .collect::<Vec<_>>();
        let pool = if fresh.is_empty() { &matching } else { &fresh };
        let action = pool[self.rng.random_range(0..pool.len())];

        let capture_rect = if self.settings.immersive_enabled
            && matches!(
                action.category,
                BehaviorCategory::FakeDamage | BehaviorCategory::CoverContent
            ) {
            choose_capture_rect(monitor, anchor_rect)
        } else {
            None
        };
        let seed = self.rng.random::<u64>();
        let motion_path = choose_motion_path(
            monitor.work_area,
            anchor_rect,
            pointer,
            usize::try_from(seed % 4).unwrap_or_default(),
        );
        let plan = EpisodePlan {
            event_id: Uuid::new_v4().to_string(),
            trigger,
            pet_id: pet,
            action_id: action.id.clone(),
            line_key: action.line_key.clone(),
            monitor_id: monitor.id.clone(),
            anchor_rect,
            motion_path,
            intro_duration_ms: intro_duration_for_pet(pet, self.settings.reduce_motion),
            capture_rect,
            locale: self.settings.locale,
            tone: self.settings.tone,
            seed,
            reduce_motion: self.settings.reduce_motion,
            power_saver: context.activity.power_mode == PowerMode::BatterySaver,
        };
        Ok((plan, monitor.work_area, action.line_key.clone()))
    }

    fn handle_click(&mut self, event_id: String, now: DateTime<Utc>) -> Vec<DirectorCommand> {
        let Some(active) = self.active.as_mut() else {
            return Vec::new();
        };
        if let Some(first_click_at) = active.first_click_at {
            if nonnegative_elapsed(now, first_click_at) <= Duration::from_secs(8) {
                return vec![self.finish_episode(now, EpisodeOutcome::UserDismissed)];
            }
        }

        active.first_click_at = Some(now);
        active.phase_started_at = now;
        self.phase = DirectorPhase::Reaction;
        let relocation = opposite_anchor(active.plan.anchor_rect, active.work_area);
        active.plan.anchor_rect = relocation;
        vec![DirectorCommand::React {
            event_id,
            reaction: ReactionKind::StartledAndRelocate,
            relocate_to: Some(relocation),
        }]
    }

    fn finish_episode(&mut self, now: DateTime<Utc>, outcome: EpisodeOutcome) -> DirectorCommand {
        let active = self
            .active
            .take()
            .expect("finish_episode requires an active episode");

        if let Some(record) = self
            .runtime
            .episode_history
            .iter_mut()
            .rev()
            .find(|record| {
                record.started_at == active.started_at
                    && record.action_id == active.plan.action_id
                    && record.pet_id == active.plan.pet_id
            })
        {
            record.dismissed_early = outcome.dismissed_early();
        }

        if active.plan.trigger != EpisodeTrigger::Tutorial {
            self.runtime
                .recent_dismissals
                .push(outcome.dismissed_early());
            if self.runtime.recent_dismissals.len() > 3 {
                self.runtime.recent_dismissals.remove(0);
            }
            if self
                .runtime
                .recent_dismissals
                .iter()
                .filter(|dismissed| **dismissed)
                .count()
                >= 2
            {
                self.runtime.adaptive_downshift_until = Some(add_std(now, ADAPTIVE_DOWNSHIFT));
            }
        }

        let policy = self.effective_policy(now);
        self.runtime.cooldown_until = Some(add_std(now, policy.cooldown));
        self.schedule_next_random(now);
        self.streak.reset();
        self.phase = DirectorPhase::Cooldown;
        DirectorCommand::Hide {
            event_id: active.plan.event_id,
            reason: outcome.hide_reason(),
        }
    }

    fn effective_policy(&self, now: DateTime<Utc>) -> PresetPolicy {
        let mut policy = self.settings.intensity.policy();
        if self
            .runtime
            .adaptive_downshift_until
            .is_some_and(|until| until > now)
        {
            policy.focus_nudge_after = policy.focus_nudge_after.saturating_mul(2);
            policy.random_min = policy.random_min.saturating_mul(2);
            policy.random_max = policy.random_max.saturating_mul(2);
            policy.cooldown = policy.cooldown.saturating_mul(2);
        }
        policy
    }

    fn schedule_next_random(&mut self, now: DateTime<Utc>) {
        let policy = self.effective_policy(now);
        let minimum = policy.random_min.as_secs();
        let maximum = policy.random_max.as_secs();
        let seconds = self.rng.random_range(minimum..=maximum);
        self.runtime.next_random_at = Some(add_std(now, Duration::from_secs(seconds)));
    }

    fn prune_history(&mut self, now: DateTime<Utc>) {
        // Forty-eight hours covers the rolling window plus local-day accounting
        // across practical timezone transitions while bounding the state file.
        let keep_since = subtract_std(now, Duration::from_secs(48 * 60 * 60));
        self.runtime
            .episode_history
            .retain(|record| record.started_at >= keep_since);
    }
}

fn category_enabled(category: BehaviorCategory, settings: &SettingsV1) -> bool {
    match category {
        BehaviorCategory::FakeDamage => settings.behavior_toggles.fake_damage,
        BehaviorCategory::CoverContent => settings.behavior_toggles.cover_content,
        BehaviorCategory::CursorPlay => settings.behavior_toggles.cursor_play,
        BehaviorCategory::Ambient => true,
    }
}

fn intro_duration_for_pet(pet: PetId, reduce_motion: bool) -> u32 {
    if reduce_motion {
        return 220;
    }
    match pet {
        PetId::Goat10 => 2_100,
        PetId::Camel7 => 2_300,
        PetId::MemeCat => 1_900,
        PetId::Shiba => 1_700,
    }
}

/// Builds a short native-window route from a monitor edge to the safe anchor.
/// Candidate edges are rotated by the episode seed and rejected if sampled
/// window bounds would cross the user's current pointer.
fn choose_motion_path(
    work: LogicalRect,
    anchor: LogicalRect,
    pointer: LogicalPoint,
    variation: usize,
) -> Vec<LogicalRect> {
    let left = i64::from(work.x);
    let top = i64::from(work.y);
    let right = left + i64::from(work.width);
    let bottom = top + i64::from(work.height);
    let width = i64::from(anchor.width);
    let height = i64::from(anchor.height);
    let to_i32 = |value: i64| {
        i32::try_from(value.clamp(i64::from(i32::MIN), i64::from(i32::MAX))).unwrap_or_default()
    };

    let candidate = |edge: usize| {
        let (start_x, start_y, inside_x, inside_y) = match edge {
            0 => (
                left - width + 28,
                i64::from(anchor.y),
                left,
                i64::from(anchor.y),
            ),
            1 => (
                right - 28,
                i64::from(anchor.y),
                right - width,
                i64::from(anchor.y),
            ),
            2 => (
                i64::from(anchor.x),
                top - height + 24,
                i64::from(anchor.x),
                top,
            ),
            _ => (
                i64::from(anchor.x),
                bottom - 24,
                i64::from(anchor.x),
                bottom - height,
            ),
        };
        vec![
            LogicalRect {
                x: to_i32(start_x),
                y: to_i32(start_y),
                ..anchor
            },
            LogicalRect {
                x: to_i32(inside_x),
                y: to_i32(inside_y),
                ..anchor
            },
            anchor,
        ]
    };

    (0..4)
        .map(|offset| candidate((variation + offset) % 4))
        .find(|path| !motion_path_crosses_pointer(path, pointer))
        .unwrap_or_else(|| vec![anchor])
}

fn motion_path_crosses_pointer(path: &[LogicalRect], pointer: LogicalPoint) -> bool {
    path.windows(2).any(|segment| {
        let [from, to] = segment else {
            return false;
        };
        (0..=24).any(|step| {
            let progress = f64::from(step) / 24.0;
            let x = f64::from(from.x) + (f64::from(to.x) - f64::from(from.x)) * progress;
            let y = f64::from(from.y) + (f64::from(to.y) - f64::from(from.y)) * progress;
            LogicalRect {
                x: x.round() as i32,
                y: y.round() as i32,
                width: from.width,
                height: from.height,
            }
            .contains(pointer)
        })
    })
}

fn choose_monitor(monitors: &[MonitorSnapshot], pointer: LogicalPoint) -> Option<&MonitorSnapshot> {
    let usable = |monitor: &&MonitorSnapshot| {
        monitor.work_area.width > 0
            && monitor.work_area.height > 0
            && monitor.scale_factor_percent > 0
    };
    monitors
        .iter()
        .filter(usable)
        .find(|monitor| monitor.work_area.contains(pointer))
        .or_else(|| {
            monitors
                .iter()
                .filter(usable)
                .find(|monitor| monitor.primary)
        })
        .or_else(|| monitors.iter().find(usable))
}

fn choose_safe_anchor(work: LogicalRect, pointer: LogicalPoint) -> Option<LogicalRect> {
    if work.width == 0 || work.height == 0 || !work.contains(pointer) {
        return None;
    }
    let width = work.width.min(280);
    let height = work.height.min(220);
    let gap = 24_i64;
    let left = i64::from(work.x);
    let top = i64::from(work.y);
    let right = left + i64::from(work.width);
    let bottom = top + i64::from(work.height);
    let px = i64::from(pointer.x);
    let py = i64::from(pointer.y);

    let raw_candidates = [
        (px + gap, py - i64::from(height) / 2),
        (px - gap - i64::from(width), py - i64::from(height) / 2),
        (px - i64::from(width) / 2, py + gap),
        (px - i64::from(width) / 2, py - gap - i64::from(height)),
        (right - i64::from(width), bottom - i64::from(height)),
        (left, bottom - i64::from(height)),
        (right - i64::from(width), top),
        (left, top),
    ];

    raw_candidates.into_iter().find_map(|(x, y)| {
        let max_x = right - i64::from(width);
        let max_y = bottom - i64::from(height);
        let x = x.clamp(left, max_x);
        let y = y.clamp(top, max_y);
        let rect = LogicalRect {
            x: i32::try_from(x).ok()?,
            y: i32::try_from(y).ok()?,
            width,
            height,
        };
        (!rect.contains(pointer)).then_some(rect)
    })
}

fn choose_capture_rect(monitor: &MonitorSnapshot, anchor: LogicalRect) -> Option<LogicalRect> {
    let work = monitor.work_area;
    let area_limit = work.area().saturating_mul(MAX_EFFECT_AREA_PERCENT) / 100;
    let scale = u64::from(monitor.scale_factor_percent);
    let physical_limit = MAX_CAPTURE_PHYSICAL_PIXELS
        .saturating_mul(10_000)
        .checked_div(scale.saturating_mul(scale))?;
    let max_area = area_limit.min(physical_limit);
    if max_area == 0 {
        return None;
    }

    let mut width = work.width.min(MAX_CAPTURE_WIDTH);
    let mut height = work.height.min(MAX_CAPTURE_HEIGHT);
    let current_area = u64::from(width) * u64::from(height);
    if current_area > max_area {
        let ratio = (max_area as f64 / current_area as f64).sqrt();
        width = ((f64::from(width) * ratio).floor() as u32).max(1);
        height = ((f64::from(height) * ratio).floor() as u32).max(1);
    }
    while u64::from(width) * u64::from(height) > max_area {
        if width >= height && width > 1 {
            width -= 1;
        } else if height > 1 {
            height -= 1;
        } else {
            return None;
        }
    }

    let right = i64::from(work.x) + i64::from(work.width);
    let bottom = i64::from(work.y) + i64::from(work.height);
    let x = i64::from(anchor.x).clamp(i64::from(work.x), right - i64::from(width));
    let y = i64::from(anchor.y).clamp(i64::from(work.y), bottom - i64::from(height));
    Some(LogicalRect {
        x: i32::try_from(x).ok()?,
        y: i32::try_from(y).ok()?,
        width,
        height,
    })
}

fn opposite_anchor(anchor: LogicalRect, work: LogicalRect) -> LogicalRect {
    let left_distance = i64::from(anchor.x) - i64::from(work.x);
    let work_right = i64::from(work.x) + i64::from(work.width);
    let anchor_right = i64::from(anchor.x) + i64::from(anchor.width);
    let right_distance = work_right - anchor_right;
    let x = if left_distance <= right_distance {
        work_right - i64::from(anchor.width)
    } else {
        i64::from(work.x)
    };
    LogicalRect {
        x: i32::try_from(x).unwrap_or(work.x),
        y: anchor.y,
        ..anchor
    }
}

fn rect_inside(inner: LogicalRect, outer: LogicalRect) -> bool {
    inner.width > 0
        && inner.height > 0
        && i64::from(inner.x) >= i64::from(outer.x)
        && i64::from(inner.y) >= i64::from(outer.y)
        && i64::from(inner.x) + i64::from(inner.width)
            <= i64::from(outer.x) + i64::from(outer.width)
        && i64::from(inner.y) + i64::from(inner.height)
            <= i64::from(outer.y) + i64::from(outer.height)
}

fn add_std(at: DateTime<Utc>, duration: Duration) -> DateTime<Utc> {
    at.checked_add_signed(TimeDelta::from_std(duration).unwrap_or(TimeDelta::MAX))
        .unwrap_or(DateTime::<Utc>::MAX_UTC)
}

fn subtract_std(at: DateTime<Utc>, duration: Duration) -> DateTime<Utc> {
    at.checked_sub_signed(TimeDelta::from_std(duration).unwrap_or(TimeDelta::MAX))
        .unwrap_or(DateTime::<Utc>::MIN_UTC)
}

fn nonnegative_elapsed(later: DateTime<Utc>, earlier: DateTime<Utc>) -> Duration {
    later
        .signed_duration_since(earlier)
        .to_std()
        .unwrap_or(Duration::ZERO)
}

#[cfg(test)]
mod tests {
    use chrono::TimeDelta;
    use proptest::prelude::*;

    use super::*;
    use crate::core::{
        BehaviorToggles, DismissPolicy, HitRegion, Locale, PetId, PowerMode, QuietHours, Tone,
        TriggerTag,
    };

    fn now() -> DateTime<Utc> {
        DateTime::parse_from_rfc3339("2026-08-01T02:00:00Z")
            .unwrap()
            .with_timezone(&Utc)
    }

    fn monitor() -> MonitorSnapshot {
        MonitorSnapshot {
            id: "primary".into(),
            work_area: LogicalRect {
                x: -1_920,
                y: 0,
                width: 1_920,
                height: 1_080,
            },
            scale_factor_percent: 200,
            primary: true,
        }
    }

    fn activity() -> ActivitySnapshot {
        ActivitySnapshot {
            last_input_age_ms: 1_000,
            session_state: SessionState::Active,
            power_mode: PowerMode::Normal,
            fullscreen_state: FullscreenState::None,
            pointer: Some(LogicalPoint { x: -900, y: 500 }),
            mouse_buttons_down: false,
        }
    }

    fn action(id: &str, line_key: &str) -> ActionManifest {
        ActionManifest {
            schema_version: 1,
            id: id.into(),
            pet_ids: vec![PetId::Goat10],
            trigger_tags: vec![
                TriggerTag::Focus,
                TriggerTag::Random,
                TriggerTag::Manual,
                TriggerTag::Tutorial,
            ],
            category: BehaviorCategory::FakeDamage,
            duration_ms: 8_000,
            motion_rig: "Goat".into(),
            motion_controller: "FreeMotionDirector".into(),
            inputs: Vec::new(),
            markers: vec!["entranceComplete".into(), "mischiefComplete".into()],
            hit_regions: vec![HitRegion {
                pose: "idle".into(),
                polygon: vec![
                    LogicalPoint { x: 0, y: 0 },
                    LogicalPoint { x: 20, y: 0 },
                    LogicalPoint { x: 10, y: 20 },
                ],
            }],
            line_key: line_key.into(),
            sfx_cue: None,
            dismiss_policy: DismissPolicy::default(),
        }
    }

    fn settings() -> SettingsV1 {
        SettingsV1 {
            locale: Locale::En,
            // These scheduler fixtures use the Goat-only `action` helper;
            // pin the selection so changing the product default does not
            // silently change what each scheduler test exercises.
            selected_pets: vec![PetId::Goat10],
            tone: Tone::Kind,
            quiet_hours: QuietHours {
                enabled: false,
                ..QuietHours::default()
            },
            immersive_enabled: true,
            behavior_toggles: BehaviorToggles::default(),
            onboarding_completed: true,
            ..SettingsV1::default()
        }
    }

    fn context<'a>(
        at: DateTime<Utc>,
        activity: &'a ActivitySnapshot,
        monitors: &'a [MonitorSnapshot],
        actions: &'a [ActionManifest],
    ) -> DirectorContext<'a> {
        DirectorContext {
            now: at,
            local_date: NaiveDate::from_ymd_opt(2026, 8, 1).unwrap(),
            local_minute: 9 * 60,
            activity,
            monitors,
            actions,
        }
    }

    fn ready_director(at: DateTime<Utc>) -> BehaviorDirector {
        BehaviorDirector::new(
            settings(),
            RuntimeStateV1::default(),
            at - TimeDelta::minutes(6),
            42,
        )
        .unwrap()
    }

    #[test]
    fn exact_preset_values_match_product_policy() {
        let gentle = Intensity::Gentle.policy();
        assert_eq!(gentle.focus_nudge_after, Duration::from_secs(60 * 60));
        assert_eq!(gentle.random_min, Duration::from_secs(90 * 60));
        assert_eq!((gentle.max_rolling_four_hours, gentle.max_daily), (2, 4));

        let playful = Intensity::Playful.policy();
        assert_eq!(playful.cooldown, Duration::from_secs(20 * 60));
        assert_eq!((playful.max_rolling_four_hours, playful.max_daily), (3, 6));

        let chaos = Intensity::Chaos.policy();
        assert_eq!(chaos.random_max, Duration::from_secs(50 * 60));
        assert_eq!((chaos.max_rolling_four_hours, chaos.max_daily), (4, 8));
    }

    #[test]
    fn episode_plan_carries_motion_and_power_preferences_to_renderers() {
        let at = now();
        let mut next_settings = settings();
        next_settings.reduce_motion = true;
        let mut director = BehaviorDirector::new(
            next_settings,
            RuntimeStateV1::default(),
            at - TimeDelta::minutes(6),
            42,
        )
        .unwrap();
        let mut low_power_activity = activity();
        low_power_activity.power_mode = PowerMode::BatterySaver;
        let monitors = [monitor()];
        let actions = [action("headbutt", "goat.taunt")];

        let commands = director
            .summon(&context(at, &low_power_activity, &monitors, &actions))
            .unwrap();
        let [DirectorCommand::Start { plan }] = commands.as_slice() else {
            panic!("expected an episode to start");
        };
        assert!(plan.reduce_motion);
        assert!(plan.power_saver);
        assert_eq!(plan.intro_duration_ms, 220);
        assert_eq!(plan.motion_path.last(), Some(&plan.anchor_rect));
    }

    #[test]
    fn active_computer_use_can_trigger_a_roaming_episode_without_app_or_document_data() {
        let at = now();
        let active = activity();
        let pointer = active.pointer.unwrap();
        let monitors = [monitor()];
        let actions = [action("headbutt", "goat.taunt")];
        let runtime = RuntimeStateV1 {
            next_random_at: Some(at),
            ..RuntimeStateV1::default()
        };
        let mut director =
            BehaviorDirector::new(settings(), runtime, at - TimeDelta::minutes(6), 17).unwrap();

        let commands = director
            .tick(&context(at, &active, &monitors, &actions))
            .unwrap();
        let [DirectorCommand::Start { plan }] = commands.as_slice() else {
            panic!("active input should permit a random visit");
        };
        assert!(plan.motion_path.len() >= 2);
        assert_eq!(plan.motion_path.last(), Some(&plan.anchor_rect));
        assert!(!motion_path_crosses_pointer(&plan.motion_path, pointer));
        assert_eq!(plan.intro_duration_ms, 2_100);
        assert_eq!(plan.line_key, "goat.taunt");
    }

    #[test]
    fn startup_grace_and_hard_safety_gates_block_manual_summon() {
        let at = now();
        let activity = activity();
        let monitors = [monitor()];
        let actions = [action("headbutt", "goat.taunt")];
        let mut director =
            BehaviorDirector::new(settings(), RuntimeStateV1::default(), at, 1).unwrap();
        assert_eq!(
            director
                .summon(&context(at, &activity, &monitors, &actions))
                .unwrap(),
            vec![DirectorCommand::Blocked {
                reason: SafetyBlock::StartupOrResumeGrace
            }]
        );

        let mut locked = activity.clone();
        locked.session_state = SessionState::Locked;
        assert_eq!(
            director
                .summon(&context(
                    at + TimeDelta::minutes(6),
                    &locked,
                    &monitors,
                    &actions
                ))
                .unwrap(),
            vec![DirectorCommand::Blocked {
                reason: SafetyBlock::SessionUnavailable
            }]
        );
    }

    #[test]
    fn scripted_tutorial_bypasses_startup_grace_but_not_lock_safety() {
        let at = now();
        let activity = activity();
        let monitors = [monitor()];
        let actions = [action("headbutt", "goat.taunt")];
        let mut director =
            BehaviorDirector::new(settings(), RuntimeStateV1::default(), at, 1).unwrap();
        assert!(matches!(
            director
                .start_tutorial(&context(at, &activity, &monitors, &actions))
                .unwrap()
                .as_slice(),
            [DirectorCommand::Start { plan }] if plan.trigger == EpisodeTrigger::Tutorial
        ));

        let mut locked_director =
            BehaviorDirector::new(settings(), RuntimeStateV1::default(), at, 1).unwrap();
        let mut locked = activity;
        locked.session_state = SessionState::Locked;
        assert_eq!(
            locked_director
                .start_tutorial(&context(at, &locked, &monitors, &actions))
                .unwrap(),
            vec![DirectorCommand::Blocked {
                reason: SafetyBlock::SessionUnavailable,
            }]
        );
    }

    #[test]
    fn manual_summon_bypasses_pause_and_budget_but_not_safety() {
        let at = now();
        let activity = activity();
        let monitors = [monitor()];
        let actions = [action("headbutt", "goat.taunt")];
        let mut director = ready_director(at);
        director.set_paused(true);
        for index in 0..10 {
            director.runtime.episode_history.push(EpisodeRecord {
                started_at: at - TimeDelta::minutes(index),
                local_date: NaiveDate::from_ymd_opt(2026, 8, 1).unwrap(),
                trigger: EpisodeTrigger::Random,
                pet_id: PetId::Goat10,
                action_id: "old".into(),
                line_key: format!("old.{index}"),
                dismissed_early: false,
            });
        }
        let commands = director
            .summon(&context(at, &activity, &monitors, &actions))
            .unwrap();
        assert!(matches!(
            commands.as_slice(),
            [DirectorCommand::Start { .. }]
        ));
    }

    #[test]
    fn rolling_budget_blocks_an_automatic_due_event() {
        let at = now();
        let activity = activity();
        let monitors = [monitor()];
        let actions = [action("headbutt", "goat.taunt")];
        let mut runtime = RuntimeStateV1 {
            next_random_at: Some(at),
            ..RuntimeStateV1::default()
        };
        for index in 0..3 {
            runtime.episode_history.push(EpisodeRecord {
                started_at: at - TimeDelta::minutes(30 + index),
                local_date: NaiveDate::from_ymd_opt(2026, 8, 1).unwrap(),
                trigger: EpisodeTrigger::Random,
                pet_id: PetId::Goat10,
                action_id: format!("old-{index}"),
                line_key: format!("old.{index}"),
                dismissed_early: false,
            });
        }
        let mut director =
            BehaviorDirector::new(settings(), runtime, at - TimeDelta::minutes(6), 1).unwrap();
        let commands = director
            .tick(&context(at, &activity, &monitors, &actions))
            .unwrap();
        assert_eq!(
            commands,
            vec![DirectorCommand::Blocked {
                reason: SafetyBlock::RollingBudget
            }]
        );
    }

    #[test]
    fn only_one_episode_runs_and_stale_events_are_ignored() {
        let at = now();
        let activity = activity();
        let monitors = [monitor()];
        let actions = [action("headbutt", "goat.taunt")];
        let mut director = ready_director(at);
        let commands = director
            .summon(&context(at, &activity, &monitors, &actions))
            .unwrap();
        let event_id = match &commands[0] {
            DirectorCommand::Start { plan } => plan.event_id.clone(),
            other => panic!("unexpected {other:?}"),
        };
        assert_eq!(
            director
                .summon(&context(at, &activity, &monitors, &actions))
                .unwrap(),
            vec![DirectorCommand::Blocked {
                reason: SafetyBlock::Busy
            }]
        );
        assert!(
            director
                .handle_renderer_event(
                    RendererEvent::Completed {
                        event_id: "stale".into()
                    },
                    at
                )
                .is_empty()
        );
        assert_eq!(director.active_plan().unwrap().event_id, event_id);
    }

    #[test]
    fn first_click_relocates_and_second_click_dismisses() {
        let at = now();
        let activity = activity();
        let monitors = [monitor()];
        let actions = [action("headbutt", "goat.taunt")];
        let mut director = ready_director(at);
        let commands = director
            .summon(&context(at, &activity, &monitors, &actions))
            .unwrap();
        let event_id = match &commands[0] {
            DirectorCommand::Start { plan } => plan.event_id.clone(),
            _ => unreachable!(),
        };
        let first = director.handle_renderer_event(
            RendererEvent::Clicked {
                event_id: event_id.clone(),
            },
            at + TimeDelta::seconds(1),
        );
        assert!(matches!(
            first.as_slice(),
            [DirectorCommand::React {
                reaction: ReactionKind::StartledAndRelocate,
                relocate_to: Some(_),
                ..
            }]
        ));
        let second = director.handle_renderer_event(
            RendererEvent::Clicked {
                event_id: event_id.clone(),
            },
            at + TimeDelta::seconds(2),
        );
        assert_eq!(
            second,
            vec![DirectorCommand::Hide {
                event_id,
                reason: HideReason::UserDismissed
            }]
        );
        assert_eq!(director.phase(), DirectorPhase::Cooldown);
    }

    #[test]
    fn a_valid_drop_relocates_the_native_pet_window() {
        let at = now();
        let activity = activity();
        let monitors = [monitor()];
        let actions = [action("headbutt", "goat.taunt")];
        let mut director = ready_director(at);
        let started = director
            .summon(&context(at, &activity, &monitors, &actions))
            .unwrap();
        let event_id = match &started[0] {
            DirectorCommand::Start { plan } => plan.event_id.clone(),
            _ => unreachable!(),
        };
        let dropped = LogicalRect {
            x: -1_850,
            y: 700,
            width: 280,
            height: 220,
        };

        assert_eq!(
            director.handle_renderer_event(
                RendererEvent::Dragged {
                    event_id: event_id.clone(),
                    anchor: Some(dropped),
                },
                at + TimeDelta::seconds(1),
            ),
            vec![DirectorCommand::React {
                event_id,
                reaction: ReactionKind::DragReleased,
                relocate_to: Some(dropped),
            }]
        );
        assert_eq!(director.active_plan().unwrap().anchor_rect, dropped);
    }

    #[test]
    fn two_early_dismissals_in_three_enable_downshift() {
        let at = now();
        let activity = activity();
        let monitors = [monitor()];
        let actions = [action("headbutt", "goat.taunt")];
        let runtime = RuntimeStateV1 {
            recent_dismissals: vec![true, false],
            ..RuntimeStateV1::default()
        };
        let mut director =
            BehaviorDirector::new(settings(), runtime, at - TimeDelta::minutes(6), 2).unwrap();
        let commands = director
            .summon(&context(at, &activity, &monitors, &actions))
            .unwrap();
        let event_id = match &commands[0] {
            DirectorCommand::Start { plan } => plan.event_id.clone(),
            _ => unreachable!(),
        };
        director.emergency_hide(at + TimeDelta::seconds(1));
        assert!(
            director
                .runtime
                .adaptive_downshift_until
                .is_some_and(|until| until >= at + TimeDelta::hours(24))
        );
        assert_ne!(event_id, "");
        assert_eq!(
            director
                .effective_policy(at + TimeDelta::seconds(1))
                .cooldown,
            Intensity::Playful.policy().cooldown.saturating_mul(2)
        );
    }

    #[test]
    fn less_of_this_is_temporary_and_does_not_change_the_preset() {
        let at = now();
        let mut director = ready_director(at);
        let selected_intensity = director.settings().intensity;

        assert!(director.less_of_this(at).is_empty());
        assert_eq!(director.settings().intensity, selected_intensity);
        assert_eq!(
            director.runtime.adaptive_downshift_until,
            Some(at + TimeDelta::hours(24))
        );
        let next_random = director.runtime.next_random_at.unwrap();
        assert!(next_random >= at + TimeDelta::minutes(90));
        assert!(next_random <= at + TimeDelta::minutes(180));
    }

    #[test]
    fn less_of_this_dismisses_a_visible_episode() {
        let at = now();
        let activity = activity();
        let monitors = [monitor()];
        let actions = [action("headbutt", "goat.taunt")];
        let mut director = ready_director(at);
        let started = director
            .summon(&context(at, &activity, &monitors, &actions))
            .unwrap();
        let event_id = match &started[0] {
            DirectorCommand::Start { plan } => plan.event_id.clone(),
            _ => unreachable!(),
        };

        assert_eq!(
            director.less_of_this(at + TimeDelta::seconds(1)),
            vec![DirectorCommand::Hide {
                event_id,
                reason: HideReason::UserDismissed,
            }]
        );
        assert_eq!(director.phase(), DirectorPhase::Cooldown);
    }

    #[test]
    fn episode_times_out_at_twelve_seconds() {
        let at = now();
        let activity = activity();
        let monitors = [monitor()];
        let actions = [action("headbutt", "goat.taunt")];
        let mut director = ready_director(at);
        let commands = director
            .summon(&context(at, &activity, &monitors, &actions))
            .unwrap();
        let event_id = match &commands[0] {
            DirectorCommand::Start { plan } => plan.event_id.clone(),
            _ => unreachable!(),
        };
        let commands = director
            .tick(&context(
                at + TimeDelta::seconds(12),
                &activity,
                &monitors,
                &actions,
            ))
            .unwrap();
        assert_eq!(
            commands,
            vec![DirectorCommand::Hide {
                event_id,
                reason: HideReason::TimedOut
            }]
        );
    }

    #[test]
    fn capture_rect_obeys_all_limits_on_retina_and_negative_coordinates() {
        let monitor = monitor();
        let rect = choose_capture_rect(
            &monitor,
            LogicalRect {
                x: -500,
                y: 600,
                width: 280,
                height: 220,
            },
        )
        .unwrap();
        assert!(rect_inside(rect, monitor.work_area));
        assert!(rect.width <= MAX_CAPTURE_WIDTH);
        assert!(rect.height <= MAX_CAPTURE_HEIGHT);
        assert!(rect.area() <= monitor.work_area.area() * 12 / 100);
        let scale = u64::from(monitor.scale_factor_percent);
        assert!(rect.area() * scale * scale / 10_000 <= MAX_CAPTURE_PHYSICAL_PIXELS);
    }

    proptest! {
        #[test]
        fn capture_geometry_is_bounded_for_valid_monitors(
            width in 64_u32..8_000,
            height in 64_u32..5_000,
            scale in 100_u16..401,
            origin_x in -10_000_i32..10_000,
            origin_y in -10_000_i32..10_000,
        ) {
            let monitor = MonitorSnapshot {
                id: "generated".into(),
                work_area: LogicalRect { x: origin_x, y: origin_y, width, height },
                scale_factor_percent: scale,
                primary: true,
            };
            let anchor = LogicalRect {
                x: origin_x,
                y: origin_y,
                width: width.min(280),
                height: height.min(220),
            };
            let capture = choose_capture_rect(&monitor, anchor).unwrap();
            prop_assert!(rect_inside(capture, monitor.work_area));
            prop_assert!(capture.width <= 640);
            prop_assert!(capture.height <= 480);
            prop_assert!(capture.area() <= monitor.work_area.area() * 12 / 100);
            let scale = u64::from(scale);
            prop_assert!(capture.area() * scale * scale / 10_000 <= MAX_CAPTURE_PHYSICAL_PIXELS);
        }

        #[test]
        fn generated_anchor_never_contains_pointer(
            width in 600_u32..5_000,
            height in 240_u32..3_000,
            pointer_x_fraction in 0_u32..10_000,
            pointer_y_fraction in 0_u32..10_000,
        ) {
            let work = LogicalRect { x: -2_500, y: -1_500, width, height };
            let point = LogicalPoint {
                x: work.x + ((u64::from(width - 1) * u64::from(pointer_x_fraction) / 10_000) as i32),
                y: work.y + ((u64::from(height - 1) * u64::from(pointer_y_fraction) / 10_000) as i32),
            };
            let anchor = choose_safe_anchor(work, point).unwrap();
            prop_assert!(rect_inside(anchor, work));
            prop_assert!(!anchor.contains(point));
        }
    }
}
