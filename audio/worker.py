"""Local-only speech worker. Audio is decoded from memory, never saved to disk."""
import base64
import io
import json
import os
import sys
from decode import decode_audio

os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL = os.path.join(ROOT, 'data', 'speech-model')

def emit(value):
    print(json.dumps(value, ensure_ascii=True), flush=True)

if '--setup' in sys.argv:
    from faster_whisper.utils import download_model
    download_model('base', output_dir=MODEL)
    from faster_whisper import WhisperModel
    model = WhisperModel(MODEL, device='cpu', compute_type='int8', cpu_threads=2, local_files_only=True)
    # Verify the actual decoder + speech path, not just that model weights load.
    import wave
    probe = io.BytesIO()
    with wave.open(probe, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes(bytes(32000))
    segments, _ = model.transcribe(decode_audio(probe.getvalue()), vad_filter=True)
    list(segments)
    with open(os.path.join(MODEL, 'ready'), 'w') as marker:
        marker.write('base-int8')
    emit({'ready': True})
    sys.exit(0)

os.environ['HF_HUB_OFFLINE'] = '1'
try:
    from faster_whisper import WhisperModel
    model = WhisperModel(MODEL, device='cpu', compute_type='int8', cpu_threads=2, local_files_only=True)
    emit({'ready': True})
except Exception:
    emit({'error': 'Local speech model could not load. Run Set up local transcription in Connections.'})
    sys.exit(1)

for line in sys.stdin:
    try:
        request = json.loads(line)
        audio = base64.b64decode(request['audio'], validate=True)
        if not 1 <= len(audio) <= 2_000_000:
            raise ValueError('Audio chunk size')
        samples = decode_audio(audio)
        if len(samples) == 0:
            emit({'segments': [], 'language': None})
            continue
        segments, info = model.transcribe(samples, beam_size=3,
            vad_filter=True, condition_on_previous_text=False,
            hallucination_silence_threshold=2)
        result = []
        for segment in segments:
            if segment.no_speech_prob < .6 and segment.avg_logprob > -1:
                result.append({'text': segment.text.strip(), 'start': segment.start, 'end': segment.end})
        emit({'segments': result, 'language': info.language})
    except Exception:
        emit({'error': 'This audio chunk could not be transcribed locally.'})
