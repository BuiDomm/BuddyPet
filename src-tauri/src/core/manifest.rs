use std::collections::HashSet;

use thiserror::Error;

use super::{ActionCatalogV1, ActionManifest, LogicalPoint};

pub const ACTION_MANIFEST_SCHEMA_VERSION: u16 = 1;
pub const ACTION_CATALOG_SCHEMA_VERSION: u16 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum ManifestError {
    #[error("action `{action_id}` uses schema {found}; expected {expected}")]
    UnsupportedSchema {
        action_id: String,
        found: u16,
        expected: u16,
    },
    #[error("action catalog uses schema {found}; expected {expected}")]
    UnsupportedCatalogSchema { found: u16, expected: u16 },
    #[error("an action id cannot be empty")]
    EmptyId,
    #[error("action `{action_id}` is duplicated")]
    DuplicateId { action_id: String },
    #[error("action `{action_id}` must name at least one pet")]
    NoPets { action_id: String },
    #[error("action `{action_id}` must name at least one trigger")]
    NoTriggers { action_id: String },
    #[error("action `{action_id}` duration must be in 1..=12000ms")]
    InvalidDuration { action_id: String },
    #[error("action `{action_id}` is missing its motion rig")]
    MissingMotionRig { action_id: String },
    #[error("action `{action_id}` is missing its motion controller")]
    MissingMotionController { action_id: String },
    #[error("action `{action_id}` is missing a localized line key")]
    MissingLineKey { action_id: String },
    #[error("action `{action_id}` references unknown line key `{line_key}`")]
    UnknownLineKey { action_id: String, line_key: String },
    #[error("action `{action_id}` references unknown SFX cue `{sfx_cue}`")]
    UnknownSfx { action_id: String, sfx_cue: String },
    #[error("action `{action_id}` must contain at least one hit region")]
    NoHitRegions { action_id: String },
    #[error("action `{action_id}` hit region {index} has an empty pose")]
    EmptyHitPose { action_id: String, index: usize },
    #[error("action `{action_id}` hit region {index} must be a non-zero polygon")]
    InvalidHitPolygon { action_id: String, index: usize },
    #[error("action `{action_id}` hit region {index} must stay within normalized 0..=1000 bounds")]
    HitPolygonOutOfBounds { action_id: String, index: usize },
}

impl ActionManifest {
    pub fn validate_structure(&self) -> Result<(), ManifestError> {
        let action_id = self.id.clone();
        if self.schema_version != ACTION_MANIFEST_SCHEMA_VERSION {
            return Err(ManifestError::UnsupportedSchema {
                action_id,
                found: self.schema_version,
                expected: ACTION_MANIFEST_SCHEMA_VERSION,
            });
        }
        if self.id.trim().is_empty() {
            return Err(ManifestError::EmptyId);
        }
        if self.pet_ids.is_empty() {
            return Err(ManifestError::NoPets { action_id });
        }
        if self.trigger_tags.is_empty() {
            return Err(ManifestError::NoTriggers { action_id });
        }
        if !(1..=12_000).contains(&self.duration_ms) {
            return Err(ManifestError::InvalidDuration { action_id });
        }
        if self.motion_rig.trim().is_empty() {
            return Err(ManifestError::MissingMotionRig { action_id });
        }
        if self.motion_controller.trim().is_empty() {
            return Err(ManifestError::MissingMotionController { action_id });
        }
        if self.line_key.trim().is_empty() {
            return Err(ManifestError::MissingLineKey { action_id });
        }
        if self.hit_regions.is_empty() {
            return Err(ManifestError::NoHitRegions { action_id });
        }
        for (index, region) in self.hit_regions.iter().enumerate() {
            if region.pose.trim().is_empty() {
                return Err(ManifestError::EmptyHitPose { action_id, index });
            }
            if region.polygon.len() < 3 || !polygon_has_area(&region.polygon) {
                return Err(ManifestError::InvalidHitPolygon { action_id, index });
            }
            if region
                .polygon
                .iter()
                .any(|point| !(0..=1_000).contains(&point.x) || !(0..=1_000).contains(&point.y))
            {
                return Err(ManifestError::HitPolygonOutOfBounds { action_id, index });
            }
        }
        Ok(())
    }
}

impl ActionCatalogV1 {
    pub fn validate(
        &self,
        localized_line_keys: &HashSet<String>,
        known_sfx_cues: &HashSet<String>,
    ) -> Result<(), Vec<ManifestError>> {
        if self.schema_version != ACTION_CATALOG_SCHEMA_VERSION {
            return Err(vec![ManifestError::UnsupportedCatalogSchema {
                found: self.schema_version,
                expected: ACTION_CATALOG_SCHEMA_VERSION,
            }]);
        }
        validate_action_catalog(&self.actions, localized_line_keys, known_sfx_cues)
    }
}

/// Validates all action manifests and their references to separately packaged
/// localization/audio catalogs. Every issue is returned in one pass so CI can
/// report the whole asset batch rather than failing one file at a time.
pub fn validate_action_catalog<'a>(
    actions: impl IntoIterator<Item = &'a ActionManifest>,
    localized_line_keys: &HashSet<String>,
    known_sfx_cues: &HashSet<String>,
) -> Result<(), Vec<ManifestError>> {
    let mut errors = Vec::new();
    let mut ids = HashSet::new();
    for action in actions {
        if !ids.insert(action.id.as_str()) {
            errors.push(ManifestError::DuplicateId {
                action_id: action.id.clone(),
            });
        }
        if let Err(error) = action.validate_structure() {
            errors.push(error);
            continue;
        }
        if !localized_line_keys.contains(&action.line_key) {
            errors.push(ManifestError::UnknownLineKey {
                action_id: action.id.clone(),
                line_key: action.line_key.clone(),
            });
        }
        if let Some(sfx_cue) = &action.sfx_cue {
            if !known_sfx_cues.contains(sfx_cue) {
                errors.push(ManifestError::UnknownSfx {
                    action_id: action.id.clone(),
                    sfx_cue: sfx_cue.clone(),
                });
            }
        }
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors)
    }
}

fn polygon_has_area(points: &[LogicalPoint]) -> bool {
    let doubled_area = points
        .iter()
        .zip(points.iter().cycle().skip(1))
        .take(points.len())
        .fold(0_i128, |sum, (left, right)| {
            sum + i128::from(left.x) * i128::from(right.y)
                - i128::from(right.x) * i128::from(left.y)
        });
    doubled_area != 0
}

#[cfg(test)]
mod tests {
    use serde::Deserialize;

    use super::*;
    use crate::core::{BehaviorCategory, DismissPolicy, HitRegion, PetId, TriggerTag};

    fn valid_action() -> ActionManifest {
        ActionManifest {
            schema_version: 1,
            id: "goat-headbutt".into(),
            pet_ids: vec![PetId::Goat10],
            trigger_tags: vec![TriggerTag::Random],
            category: BehaviorCategory::FakeDamage,
            duration_ms: 8_000,
            motion_rig: "Goat".into(),
            motion_controller: "FreeMotionDirector".into(),
            inputs: Vec::new(),
            markers: Vec::new(),
            hit_regions: vec![HitRegion {
                pose: "idle".into(),
                polygon: vec![
                    LogicalPoint { x: 0, y: 0 },
                    LogicalPoint { x: 20, y: 0 },
                    LogicalPoint { x: 10, y: 20 },
                ],
            }],
            line_key: "goat10.headbutt".into(),
            sfx_cue: Some("goat.impact".into()),
            dismiss_policy: DismissPolicy::default(),
        }
    }

    #[test]
    fn structure_rejects_degenerate_hit_polygons() {
        let mut action = valid_action();
        action.hit_regions[0].polygon = vec![
            LogicalPoint { x: 0, y: 0 },
            LogicalPoint { x: 10, y: 10 },
            LogicalPoint { x: 20, y: 20 },
        ];
        assert!(matches!(
            action.validate_structure(),
            Err(ManifestError::InvalidHitPolygon { .. })
        ));
    }

    #[test]
    fn structure_rejects_hit_polygons_outside_normalized_bounds() {
        let mut action = valid_action();
        action.hit_regions[0].polygon[0].x = 1_001;
        assert!(matches!(
            action.validate_structure(),
            Err(ManifestError::HitPolygonOutOfBounds { .. })
        ));
    }

    #[test]
    fn catalog_reports_reference_and_duplicate_errors_together() {
        let action = valid_action();
        let duplicate = action.clone();
        let errors =
            validate_action_catalog([&action, &duplicate], &HashSet::new(), &HashSet::new())
                .unwrap_err();
        assert!(
            errors
                .iter()
                .any(|error| matches!(error, ManifestError::DuplicateId { .. }))
        );
        assert!(
            errors
                .iter()
                .any(|error| matches!(error, ManifestError::UnknownLineKey { .. }))
        );
        assert!(
            errors
                .iter()
                .any(|error| matches!(error, ManifestError::UnknownSfx { .. }))
        );
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct LocalizationContract {
        line_keys: Vec<String>,
    }

    #[derive(Deserialize)]
    struct SfxCatalog {
        cues: Vec<SfxCue>,
    }

    #[derive(Deserialize)]
    struct SfxCue {
        id: String,
    }

    #[test]
    fn bundled_content_catalog_matches_rust_contracts() {
        let catalog: ActionCatalogV1 =
            serde_json::from_str(include_str!("../../../public/content/actions.v1.json")).unwrap();
        let localization: LocalizationContract = serde_json::from_str(include_str!(
            "../../../public/content/localization-contract.v1.json"
        ))
        .unwrap();
        let sfx: SfxCatalog =
            serde_json::from_str(include_str!("../../../public/content/sfx-cues.v1.json")).unwrap();
        let line_keys = localization.line_keys.into_iter().collect::<HashSet<_>>();
        let sfx_cues = sfx
            .cues
            .into_iter()
            .map(|cue| cue.id)
            .collect::<HashSet<_>>();

        assert_eq!(catalog.actions.len(), 17, "12 signature + 5 shared actions");
        catalog.validate(&line_keys, &sfx_cues).unwrap();
    }
}
