import XCTest

final class CollectUITests: XCTestCase {
    @MainActor func testReaderAndUnclassifiedNavigation() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing"]
        app.launch()
        XCTAssertTrue(app.navigationBars["Collect"].waitForExistence(timeout: 10))
        app.buttons["未分类"].tap()
        app.buttons["查看未分类文章"].tap()
        let article = app.staticTexts["给阅读留一点时间"]
        XCTAssertTrue(article.waitForExistence(timeout: 10))
        article.tap()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["阅读操作"].exists)
        XCTAssertTrue(app.webViews.staticTexts["这是一篇本地测试文章。"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.webViews.staticTexts["这是一篇本地测试文章。"].isHittable)
        let capture = XCTAttachment(screenshot: app.screenshot())
        capture.name = "Collect Reader"
        capture.lifetime = .keepAlways
        add(capture)
    }
}
