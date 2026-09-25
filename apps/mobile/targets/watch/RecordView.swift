import SwiftUI

// The wrist debrief — the center page, mirroring the phone's center record button.
// Offline-first: tapping the orb starts; tapping again STOPS and PERSISTS the
// recording to the queue (RecordingQueue) before any upload, so capture never
// depends on signal or the phone. Upload happens right after, on open, and
// whenever a token + network are available; failures stay queued and retry.
//
// The orb (OrbView) pulses to the mic amplitude while recording, using the
// user's palette colors handed over from the phone.

struct RecordView: View {
    @EnvironmentObject var session: WatchSession
    @EnvironmentObject var router: RecordRouter
    @StateObject private var recorder = Recorder()
    @ObservedObject private var queue = RecordingQueue.shared

    private enum Phase { case idle, recording, saving, done, error }
    @State private var phase: Phase = .idle
    @State private var message: String?
    @State private var doneNote: String = ""

    var body: some View {
        VStack(spacing: 10) {
            switch phase {
            case .idle:
                orbButton(active: false, amplitude: 0)
                Text("Tap to record")
                    .font(.subheadline.weight(.semibold))
                pendingNote
            case .recording:
                orbButton(active: true, amplitude: recorder.amplitude)
                Text(timeString(recorder.elapsed))
                    .font(.title3.monospacedDigit().weight(.semibold))
                    .foregroundStyle(session.primary)
                Text("Tap to stop & save")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            case .saving:
                ProgressView()
                Text("Saving your debrief…").font(.caption)
            case .done:
                Image(systemName: "checkmark.circle.fill")
                    .font(.largeTitle)
                    .foregroundStyle(session.primary)
                Text(doneNote)
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
        // Drain any queued recordings when the page appears (e.g. back in range).
        .task { await drainQueue() }
        // Action Button / Siri intent asks to start a debrief.
        .onChange(of: router.recordTrigger) { _, _ in
            if phase == .idle { Task { await beginRecording() } }
        }
    }

    @ViewBuilder private var pendingNote: some View {
        if queue.pendingCount > 0 {
            HStack(spacing: 4) {
                Image(systemName: "arrow.up.circle")
                Text("\(queue.pendingCount) waiting to upload")
            }
            .font(.caption2)
            .foregroundStyle(.secondary)
            .onTapGesture { Task { await drainQueue() } }
        }
    }

    private func orbButton(active: Bool, amplitude: Double) -> some View {
        Button {
            switch phase {
            case .idle: Task { await beginRecording() }
            case .recording: Task { await finishAndSave() }
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

    private func finishAndSave() async {
        guard let result = recorder.stop() else {
            message = "Recording was empty."
            phase = .error
            return
        }
        // Persist FIRST — capture is never lost, even with no signal or token.
        queue.enqueue(fileURL: result.url, duration: result.duration)
        phase = .saving
        await drainQueue()
        doneNote = queue.pendingCount == 0
            ? "Saved. It'll be ready in the app shortly."
            : "Saved. It'll upload when you're back in range."
        phase = .done
        try? await Task.sleep(nanoseconds: 1_800_000_000)
        phase = .idle
    }

    /// Upload whatever is queued, if we have a token. No token / no network → the
    /// recordings simply stay queued and retry next time.
    private func drainQueue() async {
        guard queue.pendingCount > 0, let token = session.token else { return }
        await queue.drain(using: RippleAPI(apiBase: session.apiBase, token: token))
    }
}
