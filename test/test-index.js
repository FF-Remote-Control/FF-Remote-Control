var main = require("../");

exports["test main"] = function(assert) {
  assert.pass("Unit test running!");
};

require("sdk/test").run(exports);
