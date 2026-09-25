import SwiftUI

// The wrist debrief — the center page of the watch app, mirroring the phone's
// center record button. Tap the orb to start; tap again to stop & upload. The
// entry lands in the same QUEUED pipeline as a phone recording (POST /api/record).
//
// The orb (OrbView) pulses to the mic amplitude while recording, using the
// user's palette colors handed over from the phone.

struct RecordView: View {
    @EnvironmentObject var session: WatchSession
    @EnvironmentObject var router: RecordRouter
    @StateObject private var recorder = Recorder()

    private enum Phase { case idle, recording, uploading, done, error }
    @State private var phase: Phase = .idle
    @State private var message: String?

    var body: some View {
        VStack(spacing: 10) {
            switch phase {
            case .idle:
                orbButton(active: false, amplitude: 0)
                Text("Tap to record")
                    .font(.subheadline.weight(.semibold))
            case .recording:
                orbButton(active: true, amplitude: recorder.amplitude)
                Text(timeString(recorder.elapsed))
                    .font(.title3.monospacedDigit().weight(.semibold))
                    .foregroundStyle(session.primary)
                Text("Tap to stop & save")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            case .uploading:
                ProgressView()
                Text("Saving your debrief…").font(.caption)
            case .done:
                Image(systemName: "checkmark.circle.fill")
                    .font(.largeTitle)
                    .foregroundStyle(session.primary)
                Text("Saved. It'll be ready in the app shortly.")
                    .font(.caption).multilineTextAlignment(.center)
            case .error:
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.title2)
                    .foregroundStyle(session.primary)
                Text(message ?? "Something went wrong.")
                    .font(.caption).multilineTextAlignment(.center)
                Button("Try again") { phase = .idle }
            }
        }
        .padding(.horizontal, 6)
        // Action Button / Siri intent asks to start a debrief.
        .onChange(of: router.recordTrigger) { _, _ in
            if phase == .idle { Task { await beginRecording() } }
        }
    }

    private func orbButton(active: Bool, amplitude: Double) -> some View {
        Button {
            switch phase {
            case .idle: Task { await beginRecording() }
            case .recording: Task { await finishAndUpload() }
            default: break
            }
        } label: {
            OrbView(
                amplitude: amplitude,
                active: active,
                primary: session.primary,
                primaryHi: session.primaryHi,
                secondary: session.secondary
            )
            .frame(width: 120, height: 120)
            .overlay(alignment: .center) {
                Image(systemName: active ? "stop.fill" : "mic.fill")
                    .font(.system(size: 26, weight: .semibold))
                    .foregroundStyle(.white)
                    .shadow(radius: 2)
            }
        }
        .buttonStyle(.plain)
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
            try? await Task.sleep(nanoseconds: 1_800_000_000)
            phase = .idle
        } catch {
            message = "Couldn't upload. Check your connection and try again."
            phase = .error
        }
    }
}
