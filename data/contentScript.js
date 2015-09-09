self.port.once("eval", function(code) {
    try {
        with(unsafeWindow) {
            var result = eval(code);
        }
    } catch(e) {
        self.port.emit("eval_result", {error: "evaluation error: " + e});
        return;
    }

    try {
        self.port.emit("eval_result", {result: result});
    } catch(e) {
        self.port.emit("eval_result", {error: "failed to encode result: " + e});
    }
});
