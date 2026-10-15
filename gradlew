#!/bin/sh
# Proxy wrapper for Android Gradle in Capacitor project
if [ -f "android/gradlew" ]; then
  chmod +x android/gradlew
  cd android && ./gradlew "$@"
else
  echo "Error: android/gradlew not found. Please run 'npm run build && npx cap sync android' first."
  exit 1
fi
