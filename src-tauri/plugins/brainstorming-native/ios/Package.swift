// swift-tools-version:5.9
import PackageDescription
let package = Package(
    name: "brainstorming-native",
    platforms: [.iOS(.v14)],
    products: [.library(name: "brainstorming-native", type: .static, targets: ["brainstorming-native"])],
    dependencies: [.package(name: "Tauri", path: "../.tauri/tauri-api")],
    targets: [.target(name: "brainstorming-native", dependencies: [.byName(name: "Tauri")], path: "Sources")]
)
