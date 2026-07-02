from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def read_repo_file(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


def test_voice_prompt_exposes_only_supported_language_modes():
    combined = "\n".join(
        [
            read_repo_file("backend/app/api/v1/voice.py"),
            read_repo_file("backend/app/services/nvidia_service.py"),
            read_repo_file("frontend/src/context/LanguageContext.tsx"),
        ]
    )

    assert "hinglish" not in combined.lower()
    assert 'type Language = "english" | "hindi"' in combined
    assert "CURRENT SELECTED LANGUAGE" in combined


def test_voice_prompt_preserves_required_action_tags():
    voice_source = read_repo_file("backend/app/api/v1/voice.py")
    required_tags = [
        "<ACTION: CHANGE_LANGUAGE|english>",
        "<ACTION: CHANGE_LANGUAGE|hindi>",
        "<ACTION: GO_BACK>",
        "<ACTION: CALCULATE_DISTANCE_HOME>",
        "<ACTION: CALCULATE_DISTANCE_TO|place_name>",
        "<ACTION: SETTINGS>",
        "<ACTION: SETTINGS_PROFILE>",
        "<ACTION: SETTINGS_PREFERENCES>",
        "<ACTION: SETTINGS_LOCATION>",
        "<ACTION: SETTINGS_VOICE>",
        "<ACTION: SETTINGS_SOS_CONTACTS>",
        "<ACTION: SETTINGS_LEGAL>",
        "<ACTION: SETTINGS_LOGOUT>",
        "<ACTION: SCENE_SCANNER>",
        "<ACTION: TEXT_READER>",
        "<ACTION: SOS>",
        "<ACTION: CONFIRM_SOS>",
        "<ACTION: CANCEL_SOS>",
        "<ACTION: THEME_SYSTEM>",
        "<ACTION: DARK_MODE>",
        "<ACTION: LIGHT_MODE>",
        "<ACTION: TEXT_SIZE_SMALL>",
        "<ACTION: TEXT_SIZE_MEDIUM>",
        "<ACTION: TEXT_SIZE_LARGE>",
        "<ACTION: HAPTICS_ON>",
        "<ACTION: HAPTICS_OFF>",
        "<ACTION: TALKBACK_ON>",
        "<ACTION: TALKBACK_OFF>",
        "<ACTION: UPDATE_LOCATION>",
        "<ACTION: LEGAL_ABOUT>",
        "<ACTION: LEGAL_PRIVACY>",
        "<ACTION: LEGAL_TERMS>",
        "<ACTION: LEGAL_COOKIE>",
        "<ACTION: LEGAL_LICENSE>",
        "<ACTION: CAPTURE>",
        "<ACTION: FLASHLIGHT_ON>",
        "<ACTION: FLASHLIGHT_OFF>",
        "<ACTION: INTERRUPT_TTS>",
        "<ACTION: TURN_OFF_ASSISTANT>",
    ]

    for tag in required_tags:
        assert tag in voice_source


def test_frontend_handles_prompted_action_commands():
    voice_source = read_repo_file("backend/app/api/v1/voice.py")
    frontend_source = read_repo_file("frontend/src/context/VoiceContext.tsx")

    prompted_commands = [
        "GO_BACK",
        "SETTINGS",
        "SCENE_SCANNER",
        "TEXT_READER",
        "SOS",
        "CONFIRM_SOS",
        "CANCEL_SOS",
        "THEME_SYSTEM",
        "DARK_MODE",
        "LIGHT_MODE",
        "TEXT_SIZE_SMALL",
        "TEXT_SIZE_MEDIUM",
        "TEXT_SIZE_LARGE",
        "HAPTICS_ON",
        "HAPTICS_OFF",
        "TALKBACK_ON",
        "TALKBACK_OFF",
        "UPDATE_LOCATION",
        "LEGAL_ABOUT",
        "LEGAL_PRIVACY",
        "LEGAL_TERMS",
        "LEGAL_COOKIE",
        "LEGAL_LICENSE",
        "CAPTURE",
        "FLASHLIGHT_ON",
        "FLASHLIGHT_OFF",
        "INTERRUPT_TTS",
        "TURN_OFF_ASSISTANT",
        "SETTINGS_PROFILE",
        "SETTINGS_PREFERENCES",
        "SETTINGS_LOCATION",
        "SETTINGS_VOICE",
        "SETTINGS_SOS_CONTACTS",
        "SETTINGS_LEGAL",
        "SETTINGS_LOGOUT",
    ]

    for command in prompted_commands:
        assert command in voice_source
        assert command in frontend_source


def test_prompt_does_not_contain_masculine_first_person_examples():
    combined = "\n".join(
        [
            read_repo_file("backend/app/api/v1/voice.py"),
            read_repo_file("backend/app/services/nvidia_service.py"),
            read_repo_file("frontend/src/context/LanguageContext.tsx"),
        ]
    ).lower()

    blocked_phrases = [
        "kar raha",
        "raha hoon",
        "sakta hoon",
        "मैं कर रहा",
        "कर सकता",
        "सकता हूँ",
        "सुन रहा",
    ]

    for phrase in blocked_phrases:
        assert phrase not in combined


def test_language_repair_guard_exists_for_streamed_tts():
    voice_source = read_repo_file("backend/app/api/v1/voice.py")

    assert "language_safe_history" in voice_source
    assert "enforce_spoken_language" in voice_source
    assert "language_repaired" in voice_source


def test_hindi_stt_is_normalized_before_llm_when_needed():
    voice_source = read_repo_file("backend/app/api/v1/voice.py")

    assert "normalize_stt_transcript" in voice_source
    assert "stt_transcript_normalized" in voice_source
    assert "await llm_trigger_queue.put(normalized_transcript)" in voice_source


def test_unclear_close_commands_are_clarified_before_llm_actions():
    voice_source = read_repo_file("backend/app/api/v1/voice.py")

    assert "unclear_close_command" in voice_source
    assert "clarified_unclear_close_command" in voice_source
    assert "Never use <ACTION: GO_BACK>" in voice_source


def test_flashlight_actions_are_dynamic_and_page_gated():
    voice_source = read_repo_file("backend/app/api/v1/voice.py")

    assert "SequenceMatcher" in voice_source
    assert "fuzzy_token_match" in voice_source
    assert '["flashlight", "flash", "torch", "light"]' not in voice_source
    assert "has_flashlight_control_request" in voice_source
    assert "if active_page in [\"Scene Scanner\", \"Text Reader\"]" in voice_source
    assert "direct_flashlight_blocked" in voice_source
    assert "flaslight" not in voice_source


def test_llm_actions_pass_through_safety_gate_before_frontend_execution():
    voice_source = read_repo_file("backend/app/api/v1/voice.py")

    assert "action_safety_gate" in voice_source
    assert "action_blocked" in voice_source
    assert "suppress_llm_speech" in voice_source
    assert "safety_gate_prerequisite" in voice_source
    assert "There is no SOS confirmation pending right now." in voice_source
    assert "or fuzzy_token_match(tokens, [\"back\", \"previous\"])" in voice_source


def test_user_facing_prompt_avoids_internal_technical_names():
    voice_source = read_repo_file("backend/app/api/v1/voice.py")

    assert "OSRM distance checks" not in voice_source
    assert "internal provider names" in voice_source
    assert "Rain amount" in voice_source
