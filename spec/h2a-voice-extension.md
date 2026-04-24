# H2A Voice Extension — v0.1 (Draft)

Extension for voice-based and multimodal H2A interactions.

---

## Scope

This extension defines additional primitives for H2A interactions where the
human communicates via speech instead of (or in addition to) text and visual UI.

It covers: turn-taking, speech streaming, TTS control, barge-in, and
audio channel management.

---

## V1. Voice Session Negotiation

A voice-capable Host declares voice support in `session.open`:

```json
{
  "type": "session.open",
  "hostCapabilities": {
    "rendering": ["text", "audio"],
    "voice": {
      "sttProvider": "host",
      "ttsProvider": "agent",
      "sampleRate": 16000,
      "encoding": "pcm_s16le",
      "channels": 1,
      "bargeIn": true,
      "vadSensitivity": 0.5
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `sttProvider` | Who does speech-to-text: `"host"` (client-side STT) or `"agent"` (server-side STT) |
| `ttsProvider` | Who does text-to-speech: `"host"` (client-side TTS) or `"agent"` (server-side TTS) |
| `sampleRate` | Audio sample rate in Hz |
| `encoding` | Audio encoding format |
| `channels` | Mono (1) or stereo (2) |
| `bargeIn` | Whether user can interrupt agent while it speaks |
| `vadSensitivity` | Voice Activity Detection sensitivity (0.0 = ignore noise, 1.0 = very sensitive) |

---

## V2. Turn-Taking Protocol

### V2.1 Turn States

```
AGENT_SPEAKING → (barge-in or natural end) → LISTENING
LISTENING → (speech detected) → USER_SPEAKING
USER_SPEAKING → (silence > threshold) → PROCESSING
PROCESSING → (response ready) → AGENT_SPEAKING
```

### V2.2 Turn Signals

Host → Agent:
```json
{ "type": "voice.turn", "event": "user_speech_start", "timestamp": "..." }
{ "type": "voice.turn", "event": "user_speech_end", "silenceDuration": 800 }
{ "type": "voice.turn", "event": "barge_in" }
```

Agent → Host:
```json
{ "type": "voice.turn", "event": "agent_speech_start" }
{ "type": "voice.turn", "event": "agent_speech_end" }
{ "type": "voice.turn", "event": "yield" }
```

`yield`: Agent intentionally pauses for user input (e.g., after asking a question).

### V2.3 Barge-In Behavior

When `bargeIn: true` and user starts speaking while agent is speaking:

1. Host sends `voice.turn` with `event: "barge_in"`
2. Agent MUST stop generating within 200ms
3. Agent sends `agent.frame` with `frameType: "end"`, `reason: "barge_in"`
4. Agent transitions to LISTENING, sends `presence.update: "conversing"`

When `bargeIn: false`: Host queues user speech until agent finishes.

---

## V3. Audio Streaming

### V3.1 Host-Side STT (Recommended for Privacy)

Host runs STT locally and sends text to Agent:

```json
{
  "type": "user.signal",
  "signalType": "message",
  "content": { "text": "Create a new task for the sprint" },
  "voice": {
    "confidence": 0.92,
    "partialTranscripts": [
      { "text": "Create a new", "timestamp": "...", "isFinal": false },
      { "text": "Create a new task for the sprint", "timestamp": "...", "isFinal": true }
    ]
  }
}
```

Agent receives text. No audio leaves the device.

### V3.2 Agent-Side STT

Host streams raw audio to Agent. Requires separate audio channel (WebSocket
recommended for latency).

```
Host → WebSocket → Agent
PCM audio chunks (20ms frames)

Agent → SSE → Host
Partial transcripts + final text + AgentFrames
```

H2A does NOT define the audio WebSocket protocol in detail — this is delegated
to existing standards (e.g., OpenAI Realtime API format, Deepgram streaming API).

H2A defines the COORDINATION between the audio channel and the H2A message channel.

---

## V4. TTS Control

### V4.1 Agent-Side TTS

Agent generates audio and streams it to Host:

```json
{
  "type": "agent.frame",
  "frameType": "text",
  "content": "I found 3 overdue tasks.",
  "voice": {
    "audioUrl": "wss://agent.example.com/audio/frm_001",
    "voice": "alloy",
    "speed": 1.0,
    "emotion": "neutral"
  }
}
```

### V4.2 Host-Side TTS

Agent sends text, Host synthesizes speech locally:

```json
{
  "type": "agent.frame",
  "frameType": "text",
  "content": "I found 3 overdue tasks.",
  "voice": {
    "ssml": "<speak><prosody rate='medium'>I found <emphasis>3</emphasis> overdue tasks.</prosody></speak>",
    "priority": "normal"
  }
}
```

Host uses its own TTS engine (system TTS, Web Speech API, etc.).

### V4.3 Voice for Non-Text Frames

| Frame Type | Voice Behavior |
|------------|---------------|
| `text` | Speak the text |
| `confirmation` | Speak: "[description]. [option1] or [option2]?" |
| `toast` | Speak with urgency matching severity |
| `progress` | Speak at milestones (25%, 50%, 75%, 100%), not continuously |
| `tool_card` | Speak: "Used [tool]. [summary of result]." |
| `state_delta` | Speak the `narration` field |
| `artifact` | Speak: "[name] is ready." |
| `error` | Speak the error message |

---

## V5. Wake Word / Activation

For always-listening voice hosts (smart speakers, AR headsets):

```json
{
  "type": "voice.activation",
  "method": "wake_word",
  "wakeWord": "Hey Atlas",
  "alternatives": ["Atlas", "Hey assistant"]
}
```

On detection:
1. Host sends `voice.turn` with `event: "wake_word_detected"`
2. Agent transitions to `conversing` presence
3. Agent sends acknowledgment frame (e.g., chime or "I'm listening")

---

## V6. Limitations & Future Work

This extension is deliberately minimal for v0.1:

- **No speaker diarization** — multi-speaker scenarios are v0.2
- **No emotion detection** — voice sentiment analysis is out of scope
- **No video** — lip sync, gesture recognition, avatar animation are future extensions
- **No spatial audio** — AR/VR 3D audio positioning is a separate concern
