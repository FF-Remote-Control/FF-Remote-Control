## Reporting bugs

Report them in the [Issue Tracker](https://github.com/FF-Remote-Control/FF-Remote-Control/issues)

## Repository

This project lives on [GitHub](https://github.com/FF-Remote-Control/FF-Remote-Control)

Clone it and send pull-requests!

## Firefox extension proxy file

It is very time consuming while hacking to go through this process for every tiny change:

* Make change
* Create .xpi file for extension
* Install .xpi file
* Test

Instead, there is a better way:

From [Setting up an extension development environment | MDN](https://developer.mozilla.org/en-US/docs/Setting_up_extension_development_environment#Firefox_extension_proxy_file):

> Extension files are normally installed in the user profile. However, it is
> usually easier to place extension files in a temporary location, which also
> protects source files from accidental deletion. This section explains how to
> create a proxy file that points to an extension that is installed in a
> location other than the user profile.

Create this file:

    ~/.mozilla/firefox/<profile>/extensions/remote-control@morch.com

(on linux anyway - the prefix will be different on other platforms)

And make it contain the directory where this file is in. (I create a separate test profile for testing). So my version of the file contains:

    /home/peter/work/FF-Remote-Control
