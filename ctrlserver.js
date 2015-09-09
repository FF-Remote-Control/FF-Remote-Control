"use strict";

const { CC } = require("chrome");
const { RemoteControlClientHandler } = require("clienthandler");

const ServerSocket = CC("@mozilla.org/network/server-socket;1",
                        "nsIServerSocket",
                        "init");

function RemoteControlServer(tabfn, localhostOnly, port) {
    this.clients = {};
    this.next_id = 0;
    this.tabfn = tabfn;
    this.serverSocket = new ServerSocket(port, localhostOnly, -1);
    this.serverSocket.asyncListen(this);
}

RemoteControlServer.prototype.onSocketAccepted = function(serverSocket, transport) {
    var id = this.next_id++;
    var client = new RemoteControlClientHandler(transport, this.tabfn, this.onClientClosed.bind(this));

    client.id = id;
    this.clients[id] = client;
}

RemoteControlServer.prototype.onClientClosed = function(client) {
    console.log("onClientClosed");
    delete this.clients[client.id];
}

RemoteControlServer.prototype.onStopListening = function() {
    console.log("onStopListening");
}

RemoteControlServer.prototype.shutdown = function() {
    for(var id in this.clients) {
        this.clients[id].shutdown();
    }

    this.serverSocket.close();
    this.serverSocket = null;
}

exports.RemoteControlServer = RemoteControlServer;
