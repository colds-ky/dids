![md(`](air-line-icon.jpg)
# DIDs - static storage

Coldsky is a project of turning social media (BlueSky, atproto) into a library-like cold storage of information.

## Why cold?

Traditionally you'd think about social media as a dynamic, shifty place full where interactions and posts fly left and right every minute.

This dynamic nature is what locks you into existing social media providers: they are the power grid in which these bundles of light travel.
This soup has to be hot for the life to flourish.

The idea behind Coldsky is to discover stable, slow moving aspects of this hot universe, pivot the data storage on those,
and thus enable order of magnitude faster access and analysis. Nasty shops like Cambridge Analytica, Xuiter and Facebook hoarding
access to the data is wrong.

## What is cold anyway?

Easy example: account identity is usually immutable. Even changing your handler is quite restricted, but internal id usually never changes.

Your posts are usually immutable, or slow moving. Once a post is made, only some platforms allow editing, and very very few people do.
Sure you could delete a post, but again that's rare. Posts are kinda cold.

In fact likes, follows, blocks and so on - are of that same nature.

I'm putting it to you, that most aspects of socia media are fast adding, but rarely changing.

Did the temperature just dropped a notch?

## And where DIDs come in here?

DID is fixed account identifier in BlueSky.

This repository stores a full list of these identifiers, plus some maintenance scripts. That's as Coldsky as it gets.

A DID is a long identifier in format of **did:plc:abcnm2knoyktubnmeitg6pdd** (some exceptions possible, but practically never used).
At the moment there are 3,091,797 of them stored here.

In order to simplify the storage in a git repository, the whole set is broken into 'shards' or 'buckets',
simply by grouping all dids with the same first 2 characters after **did:plc:** prefix.
Have a look at a shard [starting with '**did:plc:ne...**'](n/ne.json) for example.

## Maintenance scripts

You'll realise BlueSky accounts are being created every day -- so how do we get updates? That's where a script comes in.

In fact it isn't a script to run locally (it may come later), but a web page. That way we can update the dids at any moment,
with just a phone, or a laptop or any device.

That web page is: [dids.colds.ky](https://dids.colds.ky/)

Go ahead and open it, it won't update **this** repository, unless you have a secret GitHub AUTH key, but it does show neat dynamic
stats and gives you outstanding count of fresh new accounts not yet in the repo.

## What's next?

The first fruitful result of Coldsky initiative is account lookup. A demo of it is here:

[accounts.colds.ky](https://accounts.colds.ky/)

It stores some more data into an open public access, indexing handles and display names of about 2,000,000 accounts in BlueSky.
This indexing, stored as flat JSON files enables quick-search with no cloud database or mighty server.

The maintenance web page for that index is in works at the moment (hence 2 millions not three).

The next steps from here will be towards collecting, indexing and cold-storing interaction and follows graph
(and you bet it's going to look amazing too [oyin.bo/atlas](https://oyin.bo/atlas)).
All that multi-billion dollar knowledge of hot-soup social media, but commoditised and packed as public utility, for free.

Neato?

Get in touch [@colds.ky](https://bsky.app/profile/colds.ky).
<!-- `) // -->