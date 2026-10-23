import WatchKit

// Wrist feedback (1.9.6 watch polish). One place so every screen uses the
// same feel: a tap when recording starts/stops, success/failure when a save
// or check-off lands, a light click for optimistic list actions.
enum Haptics {
    static func start() { WKInterfaceDevice.current().play(.start) }
    static func stop() { WKInterfaceDevice.current().play(.stop) }
    static func success() { WKInterfaceDevice.current().play(.success) }
    static func failure() { WKInterfaceDevice.current().play(.failure) }
    static func click() { WKInterfaceDevice.current().play(.click) }
}
