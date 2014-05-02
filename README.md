# cameo-twitter

Small-scale Twitter crawling and archiving.


## Installation

Supposing that you're running Ubuntu, e.g., `precise`, here's what you need to get started:

* [Install postgresql-9.3](http://www.postgresql.org/download/linux/ubuntu/)
  - create / edit `/etc/apt/sources.list.d/pgdg.list`, add the line
    `deb http://apt.postgresql.org/pub/repos/apt/ precise-pgdg main`
  - Add the repo's key: `curl https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -`
  - Update: `sudo apt-get update`
  - Install: `sudo apt-get install postgresql-9.3`
* Get cameo-twitter
  - `git clone https://github.com/chbrown/cameo-twitter.git`
* Install the module:
  - `cd cameo-twitter`
  - By default it will create a database named "cameo-twitter". Edit the `config.database` value in `package.json` if you want to use something else.
  - `npm install`
  - `npm link -g`
* Now, once you have some users queued up to be watched (TODO: make this easier), you can run `cameo-twitter edges-work` to monitor the Twitter user graph.

TODO: talk about `twilight` and `~/.twitter` configuration.


## References

- [REST API v1.1](https://dev.twitter.com/docs/api/1.1)
- [twilight](https://github.com/chbrown/twilight)


## License

Copyright © 2014 Christopher Brown. [MIT Licensed](LICENSE).
