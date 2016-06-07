steal("sw/config/fixtures.json", "can/util/fixture", function (fixtures) {

    can.each(fixtures, function (fixture) {
        can.fixture(fixture.method + " " + fixture.uri, fixture.data);
    });

    // Example fixture for GET path api/stopwatch
    // can.fixture("GET api/stopwatch", "//sw/fixture/data/stopwatch.json");
});
