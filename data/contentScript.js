function evalIndirect(code) {
    /* Evaluate code using the content script's eval function.
    This is necessary if the page uses CSP to block eval or has otherwise broken eval().
    */

    code = "window = unsafeWindow; with(unsafeWindow) { " + code + " }";
    return eval(code);
}

function evalDirect(code) {
    /* Evaluate code using the page's eval function.
    This works on most pages. */

    return unsafeWindow.eval(code);
}


var evalFunc = evalDirect;
var warning = undefined;

try {
    var check = unsafeWindow.eval("42");
    if(check !== 42) {
        warning = "Sanity check failed (result = " + check + "); restrictions apply";
        evalFunc = evalIndirect;
    }
} catch(e) {
    warning = "Page has CSP enabled; restrictions apply";
    evalFunc = evalIndirect;
}

self.port.on("eval", function(msg) {
    try {
        var id = msg.id;
    } catch(e) {
        /* No meaningful way to report this error. */
        return;
    }

    try {
        var result = evalFunc(msg.cmd);
    } catch(e) {
        self.port.emit("eval_result", {id: id, error: "evaluation error: " + e, warning: warning});
        return;
    }

    try {
        self.port.emit("eval_result", {id: id, result: result, warning: warning});
    } catch(e) {
        self.port.emit("eval_result", {id: id, error: "failed to encode result: " + e, warning: warning});
    }
});
