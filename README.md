# Front Page Watch

A Devvit app for /r/undelete and /r/longtail that replicates the behaviour of the original app that is no longer operational.

This app checks /r/all (with the range of posts in /r/all configurable), and then periodically checks to see if posts that were in /r/all have been removed by moderators. If a post has been removed, then a link to the post is created in the sub that Front Page Watch is installed in.

The code for this app is open source, and can be found on GitHub [here](https://github.com/fsvreddit/front-page-watch)

## Changes

### v1.1.3

* If a linked post is deleted by the OP, or the OP deletes their account, the post on r/undelete or r/longtail will be deleted within 28 days. This is required by Reddit's Content Deletion Policy.
* Improved logging output (background only)
