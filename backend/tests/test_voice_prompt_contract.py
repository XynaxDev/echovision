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
        "<ACTION: SCENE_SCANNER>",
        "<ACTION: TEXT_READER>",
        "<ACTION: SOS>",
        "<ACTION: CONFIRM_SOS>",
        "<ACTION: CANCEL_SOS>",
        "<ACTION: DARK_MODE>",
        "<ACTION: LIGHT_MODE>",
        "<ACTION: HAPTICS_ON>",
        "<ACTION: HAPTICS_OFF>",
        "<ACTION: TALKBACK_ON>",
        "<ACTION: TALKBACK_OFF>",
        "<ACTION: UPDATE_LOCATION>",
        "<ACTION: CAPTURE>",
        "<ACTION: FLASHLIGHT>",
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
        "DARK_MODE",
        "LIGHT_MODE",
        "HAPTICS_ON",
        "HAPTICS_OFF",
        "TALKBACK_ON",
        "TALKBACK_OFF",
        "UPDATE_LOCATION",
        "CAPTURE",
        "FLASHLIGHT",
        "INTERRUPT_TTS",
        "TURN_OFF_ASSISTANT",
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
