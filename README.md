Welcome to the _Remote Control_ Firefox Extension.

It allows you to remote control a particular Firefox tab with a TCP
connection (such as telnet or netcat).

Something like this:

    base@peter:~> telnet localhost 32000
    window.location="http://www.google.com/"
    {"result":"http://www.google.com/"}

You send any Javascript commands to firefox in a single line, and it sends
either a result or an error back JSON-encoded. As a convenience, a command of
`reload` is taken to be a shortcut for `window.location.reload()`

Using netcat/nc, you can therefore:

    echo reload | nc -q 1 localhost 32000

and the page will reload.

Getting Started
===============

* Download and install the extension
* Select a Firefox window or tab you want to remote control
* Click the Remote Control toolbar button
* Use telnet, nc or any other tool to send javascript commands to your Remote
  Controlled Firefox.

Preferences and Controlling Behavior
====================================

There are preferences for:

* Whether to listen for connections from localhost only (default = localhost
  only).
* Which TCP port number to listen on (default = 32000)
* Whether to send remote commands to currently active tab (default = false)

VIM Integration
===============

If you are using VIM and if VIM is compiled with python support, you can add
the following to your .vimrc to integrate the plugin with a VIM shortcut.

    function! ReloadFirefox()
    py << EOF
    import socket
    s = socket.socket()
    s.settimeout(0.3)
    s.connect(('x.x.x.x', 32000))
    s.send('reload\n')
    s.close()
    EOF
    endfunction
    nmap <leader>r :call ReloadFirefox()<CR> 

`x.x.x.x` should be replaced with actual IP of the machine running Firefox. If
FireFox is running on the same machine as VIM, you may use `127.0.0.1`.

With the above, pressing <kbd>leader</kbd> followed by <kbd>r</kbd> should cause the Firefox 
page with the plugin activated to be refreshed. Of course, this is my key
mapping and you're free to choose a different mapping, one that fits you 
best.

To test whether VIM is built with python support, run

    vim --version

and if you see `+python` in the list of features, VIM is built with python
support.

If you don't see `+python`, you can rebuild VIM from sources with +python support.
Iinstructions for this can be found [here](https://github.com/Valloric/YouCompleteMe/wiki/Building-Vim-from-source).

Cookies management
==================

Three commands are available to manage cookies/sessions:

`clearcookies` clears all the cookies (for any domain) stored for the active profile

`getcookies` will return into `result` an array of objects. The objects represents all the cookies with their own properties.

`setcookies` followed by an array of cookie-objects sets/overwrites the cookies passed (all cookie properties **must** be defined for each cookie passed)

**Cookie properties:**

A cookie is defined by the following properties:

|Property|Type|
|-|-|
|host|string|
|path|string|
|name|string|
|value|string|
|isSecure|boolean|
|isHttpOnly|boolean|
|isSession|boolean|
|expiry|integer|

**Example:**

    $ telnet localhost 32000
    Trying 127.0.0.1...
    Connected to localhost.
    Escape character is '^]'.
    clearcookies
    {"result":"OK"}
    window.location.href="https://www.mozilla.org"
    {"result":"https://www.mozilla.org"}
    getcookies
    {"result":[{"host":".mozilla.org","path":"/","name":"optimizelyEndUserId","value":"oeu1459095848224r0.5301917878826897","isSecure":false,"isHttpOnly":false,"isSession":false,"expiry":1774455848},
               {"host":".mozilla.org","path":"/","name":"optimizelyBuckets","value":"%7B%7D","isSecure":false,"isHttpOnly":false,"isSession":false,"expiry":1774455848},
               .
               .
               .
    ] }
    setcookies [{"host":".mozilla.org","path":"/","name":"optimizelyEndUserId","value":"oeu1459095848224r0.5301917878826897","isSecure":false,"isHttpOnly":false,"isSession":false,"expiry":1774455848}]
    {"result":"OK"}

Issues
======
Please report any problems to the
[Issue tracker](https://github.com/FF-Remote-Control/FF-Remote-Control/issues)

Known issues:
- On pages protected by a Content Security Policy (CSP), some JavaScript or
DOM features are disabled. For example, you will not be able to define
functions through remote control, and some DOM functions like
`document.write` may fail. For workarounds to some of these issues, you can
consult [the Mozilla documentation on interacting with page scripts](https://developer.mozilla.org/en-US/Add-ons/SDK/Guides/Content_Scripts/Interacting_with_page_scripts).
These limitations do not apply to non-CSP pages.

Credits
=======
This version of FF-Remote-Control is a complete rewrite from version 1.
The original version was written by Peter Valdemar Mørch (pmorch) with improvements
from Hari Mahadevan (harikvpy).

The toolbar icon is from [Icons8](https://icons8.com/web-app/2102/remote-control).

License
=======

Remote Control is licensed under the
[GNU General Public License v2.0](http://www.gnu.org/licenses/gpl-2.0.html)
(See also [gpl-2.0.txt](gpl-2.0.txt))
