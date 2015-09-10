"use strict";

var { setTimeout, clearTimeout } = require("sdk/timers");

function TabControl(tab, status_callback) {
    this.pending_requests = {}; // id => {timer: setTimeout id, callback: callback}
    this.status_callback = status_callback;

    this.worker = tab.attach({
        contentScriptFile: "./contentScript.js"
    });

    this.worker.port.on('eval_result', this.receiveReply.bind(this));
    this.worker.on('detach', this.workerDetached.bind(this));
}

TabControl.prototype.receiveReply = function(reply) {
    var reqid = reply.id;
    var res = this.pending_requests[reqid];
    delete(reply.id);

    if(typeof(res) === 'undefined') {
        console.error("received reply for non-existent id " + reqid);
        return;
    }

    res.callback(reply);
    if(res.timer !== null) {
        clearTimeout(res.timer);
    }

    delete this.pending_requests[reqid];
}

TabControl.prototype.receiveTimeout = function(reqid) {
    var res = this.pending_requests[reqid];

    if(typeof(res) === 'undefined') {
        console.error("received timeout for non-existent id " + reqid);
        return;
    }

    var reply = {error: "timed out while waiting for reply"};
    res.callback(reply);
    delete this.pending_requests[reqid];
}

TabControl.prototype.submitRequest = function(reqid, cmd, callback, timeout) {
    if(typeof(timeout) === 'undefined')
        timeout = 0;

    var timer = null;
    if(timeout > 0) {
        timer = setTimeout(this.receiveTimeout.bind(this, reqid), timeout);
    }

    this.worker.port.emit("eval", {id: reqid, cmd: cmd});
    this.pending_requests[reqid] = {callback: callback, timer: timer};
}

TabControl.prototype.workerDetached = function() {
    this.abortPending("tab navigated or closed");
    this.status_callback("worker-detached");
}

TabControl.prototype.abortPending = function(reason) {
    for(var reqid in this.pending_requests) {
        this.pending_requests[reqid].callback({error: "request aborted: " + reason});
    }
    this.pending_requests = {};
}

TabControl.prototype.shutdown = function() {
    this.worker.destroy();
    this.abortPending("tab control shutdown");
}

exports.TabControl = TabControl;
