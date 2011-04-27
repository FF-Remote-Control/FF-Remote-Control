Welcome to the _Remote Control_ Firefox Extension.

It allows you to remote control a particular Firefox window with a TCP
connection (such as telnet or netcat).

Something like this:

    base@peter:~> telnet localhost 32000
    window.location="http:/www.google.com/"
    {"result":"http:/www.google.com/"}

You send any Javascript commands to firefox in a single line, and it sends
either a result or an error back JSON-encoded. As a convenience, a command of
`reload` is taken to be a shortcut for `window.location.reload()`

Using netcat/nc, you can therefore:

    echo reload | nc localhost 32000

and the page will reload.

Getting Started
===============

* Download and install the extension
* Add the _Remote Control_ Toolbar button to your toolbar
* Optionally change the preferences to select listening port number
  (default=32000) or and whether or not to listen to connections from all hosts
  or just localhost (default = localhost only).
* Select a Firefox window or tab you want to remote control
* Click the Remote Control toolbar button
    * If firebug is installed and active in that window, you can see logging in
      the Firebug console. (Firebug is not required, but the firebug console
      will be used if installed and active)
* Use telnet, nc or any other tool to send javascript commands to your Remote
  Controlled Firefox.

**NOTE**: When firefox is initially started, Remote Control is _not_ active.
You have to select a window/tab and start Remote Control by clicking the
toolbar button. You can only remote control the selected window/tab.


Issues
======
Please report any problems to the
[Issue tracker](https://github.com/pmorch/FF-Remote-Control/issues)
