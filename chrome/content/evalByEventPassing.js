/* 
    Synopsis
    ========

    // Display result from setting global variable myVariable (==45)
    evalByEventPassing(window, 'myVariable=45', function (result) {
        if (result.error) {
            Firebug.Console.log(["an error occurred", result.error]);
        } else {
            Firebug.Console.log(["myVariable got set to", result.result]);
        }
    });

    Description
    ===========

    evalByEventPassing implements a way for chrome code to communicate with a
    page safely, that doesn't have the same shortcommings as
    Components.utils.evalInSandbox. For details of what they are, see:
    http://groups.google.com/group/mozilla.dev.extensions/browse_frm/thread/6cacc96b42a04e73
    In short, *all* javascript will work with evalInSandbox.

    The price you pay, is that your page must have a head and body, and
    evalByEventPassing modifies the page slightly.

    The first time it is called on a page, chrome sets up a listener for a
    particular event on document by way of adding a script element to the
    page's <head>, so that the page can eval a command on behalf of chrome
    code. The chrome code sets up a listener on the page's document for events
    about the result of the eval.

    The chrome code then adds an element to the body of the page containing the
    string the caller wants eval-ed and dispatches an event to the page's
    listener to perform the eval in the page's context.

    The page picks up the string to eval from the target of the event, performs
    the eval and places the result in another attribute of that same element.
    It then dispatches an event to the chrome code's listener to fetch the
    result, which in turn calls the callback in chrome context.

    Callbacks
    =========

    As described above, the caller provides a string to be eval-ed and also
    provides a callback to be called when the result has been created. So the
    API for evalByEventPassing is of an asynchronous nature because of the
    events being sent back and forth.

    In order for evalByEventPassing to be reentrant, we store all callbacks in
    an array with an incrementing counter. For a particular command, the index
    into the callback array is stored in the element that gets created in the
    page's DOM. That way, when the result comes back, we know which callback to
    call.

    Strictly speaking, if one were to have a malicious page, it could alter the
    implementation of evalByEventPassingCommand to alter the element's
    callbackID in order for a different caller to get called. That would
    require that there were several evalByEventPassingCommand-s active at the
    same time (which I haven't been able to create myself). And it would *not*
    enable the malicious caller to set up any of its own code to be called as a
    callback, only alter which of the real callbacks get called for which
    command. If anyone knows how to avoid this, patches are welcome.

    Inspiration
    ===========

    "Interaction between privileged and non-privileged pages"
    https://developer.mozilla.org/en-US/docs/Code_snippets/Interaction_between_privileged_and_non-privileged_pages

    "Communication between firefox extension and page javascript"
    http://stackoverflow.com/questions/1305164/

    and Firebug's function evaluateByEventPassing

    Author
    ======

    Peter Valdemar Mørch
    peter@morch.com
*/

"use strict";

var evalByEventPassing;

// Scope limiting
(function() {

var callbacks = {};
var callbackCounter = 0;

function handleResult(body, e) {
    var result = e.target.getAttribute('result');
    var callbackID = e.target.getAttribute('callbackID');
    body.removeChild(e.target);
    try {
        result = JSON.parse(result);
    } catch (e) {
        // This should never happen since we encoded it ourselves, but
        // being defensive never hurt.
        result = { error : "Internal Remote Control error: " +
                           "couldn't decode result" };
    }

    if (!callbacks[callbackID]) return;
    callbacks[callbackID](result);
    delete(callbacks[callbackID]);
}

function initializeWindow(window) {
    var document = window.document;

    // Insert the script element that sets up communication with the
    // extension

    // The script element only gets tightly controlled content
    var scriptElement = document.createElement('script');
    scriptElement.setAttribute("type","text/javascript");
    function setupEvalByEventPassing() {
        function evalByEventPassingCommand(e) {
            var element = e.target;
            var command = element.getAttribute('command');
            element.removeAttribute('command');

            var result;
            if (typeof(command) == 'undefined') {
                result = { 'error' : "Internal Remote Control Error: " +
                                     "Couldn't find a relevant command" };
            } else {
                try {
                    // eval is only called in non-chrome page context
                    result = { 'result' : eval.call(null, command) };
                } catch (exception) {
                    result = { 'error' : exception.message };
                }
            }
            try {
                result = JSON.stringify(result);
            } catch (e) {
                // Try again, but this time just the exception.
                // (nativeJSON.encode has been known to throw
                // exceptions - to trigger this, try giving the command
                // "window" (that would return the window - which is
                // huge!)
                result = JSON.stringify({error: "Error encoding JSON string: " + e });
            }
            element.setAttribute('result', result);
            var event = document.createEvent('Event');
            event.initEvent('evalByEventPassingResultMessage',
                            true, false);
            element.dispatchEvent(event);
        };
        /* This event listener is called whenever an eval request is received */
        document.addEventListener(
            'evalByEventPassingCommandMessage',
            evalByEventPassingCommand,
            false,
            true
        );
    }
    scriptElement.textContent = setupEvalByEventPassing.toString() + ';' +
                                'setupEvalByEventPassing()';
    // By adding a script element to the page's <head>, we get the code
    // evaluated in the page's context
    document.getElementsByTagName("head")[0].appendChild(scriptElement);

    /* This event listener is called whenever an eval request completes */
    document.addEventListener(
        'evalByEventPassingResultMessage',
        function (event) {
            // Handle the result in chrome. It needs a
            // body so it can remove the element we
            // inserted earlier
            handleResult(
                document.getElementsByTagName("body")[0],
                event
            )
        },
        false,
        true);
}

evalByEventPassing = function (window, commandStr, callback) {
    var document = window.document;

    // We must have a document, body and a head for this to work:
    if (document == null) {
        callback({error: 'No document'});
        return;
    }
    if (document.getElementsByTagName("head").length == 0) {
        callback({error: 'No head in document'});
        return;
    }
    if (document.getElementsByTagName("body").length == 0) {
        callback({error: 'No body in document'});
        return;
    }

    var callbackID = (callbackCounter++);
    callbacks[callbackID] = callback;

    /* XXX: This used to use a sandbox eval to obtain "typeof setupEvalByEventPassing".
    For some reason, that would always fail and return undefined on FF >= 33.
    So, the check is now simplified, but I am not sure what the security implication(s) are! */
    if (typeof window.wrappedJSObject.setupEvalByEventPassing == "undefined") {
        initializeWindow(window);
    }

    var element = document.createElement("evalByEventPassing");
    document.getElementsByTagName("body")[0].appendChild(element);

    element.setAttribute('command', commandStr);
    element.setAttribute('callbackID', callbackID);

    // Fire an event in the page
    var event = document.createEvent("Event");
    event.initEvent("evalByEventPassingCommandMessage", true, false);
    element.dispatchEvent(event);
};

})();
