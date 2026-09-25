import SwiftUI

// The wrist debrief: record on the watch, upload straight to Ripple. The entry
// lands in the same QUEUED pipeline as a phone recording (POST /api/record), so
// it transcribes + extracts exactly like any other debrief.

struct RecordView: View {
    @EnvironmentObject var session: WatchSession
    @StateObject private var recorder = Recorder()
    @Environment(\.dismiss) private var dismiss

    private enum Phase { case idle, recording, uploading, done, error }
    @State private var phase: Phase = .idle
    @State private var message: String?

    var body: some View {
        VStack(spacing: 12) {
            switch phase {
            case .idle:
                controls(title: "Tap to record", systemImage: "mic.circle.fill") {
                    Task { await beginRecording() }
                }
            case .recording:
                VStack(spacing: 8) {
                    Text(timeString(recorder.elapsed))
                        .font(.title2.monospacedDigit().weight(.semibold))
                    Button(role: .destructive) {
                        Task { await finishAndUpload() }
                    } label: {
                        Label("Stop & save", systemImage: "stop.circle.fill")
                    }
                    .tint(Color("AccentColor"))
                }
            case .uploading:
                VStack(spacing: 8) {
                    ProgressView()
                    Text("Saving your debrief…").font(.caption)
                }
            case .done:
                status(icon: "checkmark.circle.fill", text: "Saved. It'll be ready in the app shortly.")
            case .error:
                VStack(spacing: 8) {
                    status(icon: "exclamationmark.triangle.fill", text: message ?? "Something went wrong.")
                    Button("Try again") { phase = .idle }
                }
            }
        }
        .padding()
        .navigationTitle("Debrief")
    }

    private func controls(title: String, systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: systemImage)
                    .font(.system(size: 44))
                    .foregroundStyle(Color("AccentColor"))
                Text(title).font(.headline)
            }
        }
        .buttonStyle(.plain)
    }

    private func status(icon: String, text: String) -> some View {
        VStack(spacing: 8) {
            Image(systemName: icon).font(.largeTitle).foregroundStyle(Color("AccentColor"))
            Text(text).font(.caption).multilineTextAlignment(.center)
        }
    }

    private func timeString(_ s: Int) -> String {
        String(format: "%01d:%02d", s / 60, s % 60)
    }

    private func beginRecording() async {
        let granted = await recorder.requestPermission()
        guard granted else {
            message = "Microphone access is off. Enable it in Watch Settings."
            phase = .error
            return
        }
        do {
            try recorder.start()
            phase = .recording
        } catch {
            message = "Couldn't start recording."
            phase = .error
        }
    }

    private func finishAndUpload() async {
        guard let result = recorder.stop() else {
            message = "Recording was empty."
            phase = .error
            return
        }
        guard let token = session.token else {
            message = "Sign in on your phone first."
            phase = .error
            return
        }
        phase = .uploading
        let api = RippleAPI(apiBase: session.apiBase, token: token)
        do {
            try await api.uploadRecording(fileURL: result.url, durationSeconds: result.duration)
            recorder.cleanup()
            phase = .done
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            dismiss()
        } catch {
            message = "Couldn't upload. Check your connection and try again."
            phase = .error
        }
    }
}
