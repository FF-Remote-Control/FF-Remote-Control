"use strict";

function replyError(reqid, error) {
    console.error("reply error " + error);
    self.port.emit("eval_result", {id: reqid, error: "" + error});
}

function replyResult(reqid, result) {
    console.error("reply result " + result);
    self.port.emit("eval_result", {id: reqid, result: result});
}

self.port.on("eval", function(msg) {
    try {
        var reqid = msg.id;
        var code = msg.cmd;

        try {
            var result = eval(code);
        } catch(e) {
            replyError(reqid, e);
            return;
        }

        try {
            replyResult(reqid, result);
        } catch(e) {
            replyError(reqid, "failed to encode result: " + e);
        }
    } catch(e) {
        replyError(reqid, "internal error: malformed request");
        return;
    }
});
