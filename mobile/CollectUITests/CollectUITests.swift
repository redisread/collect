import XCTest

final class CollectUITests: XCTestCase {
  @MainActor func testSubscriptionManagementEntry() {
    let app = XCUIApplication()
    app.launchArguments = ["--ui-testing"]
    app.launch()
    XCTAssertTrue(app.navigationBars["Collect"].waitForExistence(timeout: 10))
    app.buttons["unclassified-folder"].tap()
    app.staticTexts["阅读笔记"].press(forDuration: 1)
    app.buttons["管理订阅"].tap()
    XCTAssertTrue(app.buttons["保存位置"].waitForExistence(timeout: 5))
  }

  @MainActor func testRestoresReadingProgress() {
    let app = XCUIApplication()
    app.launchArguments = ["--ui-testing", "--resume-reading"]
    app.launch()
    XCTAssertTrue(app.navigationBars["Collect"].waitForExistence(timeout: 10))
    app.buttons["unclassified-folder"].tap()
    app.buttons["查看未分类文章"].tap()
    app.staticTexts["给阅读留一点时间"].tap()
    let end = app.webViews.staticTexts["阅读终点"]
    XCTAssertTrue(end.waitForExistence(timeout: 10))
    let visible = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "hittable == true"), object: end)
    XCTAssertEqual(XCTWaiter.wait(for: [visible], timeout: 10), .completed)
  }

  @MainActor func testReaderAndUnclassifiedNavigation() {
    let app = XCUIApplication()
    app.launchArguments = ["--ui-testing"]
    app.launch()
    XCTAssertTrue(app.navigationBars["Collect"].waitForExistence(timeout: 10))
    app.buttons["unclassified-folder"].tap()
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
