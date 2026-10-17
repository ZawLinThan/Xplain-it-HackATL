#!/usr/bin/env sh
# Copies the MediaPipe wasm files and downloads the face model into public/mediapipe/ so the
# look-away detector works offline. Run once after `npm install`:  npm run setup-gaze
set -eu
cd "$(dirname "$0")/.."
DEST=public/mediapipe
MODEL_URL="https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
mkdir -p "$DEST/wasm"
cp node_modules/@mediapipe/tasks-vision/wasm/* "$DEST/wasm/"
if [ -s "$DEST/face_landmarker.task" ]; then
  echo "face_landmarker.task already present"
else
  echo "downloading face_landmarker.task (about 4 MB)"
  curl -fL --retry 3 -o "$DEST/face_landmarker.task" "$MODEL_URL"
fi
echo "done: $DEST"
