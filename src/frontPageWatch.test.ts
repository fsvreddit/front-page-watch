import { getNewPostTitle, PostTitleInfo } from "./frontPageWatch.js";

test("Normal Length Title", () => {
    const postInfo: PostTitleInfo = {
        index: 43,
        commentCount: 164,
        upvotes: 1852,
        postTitle: "Look at this thing I made",
        subredditName: "books",
    };

    const expected = "[#43|+1852|164] Look at this thing I made [r/books]";
    const actual = getNewPostTitle(postInfo);

    expect(actual).toEqual(expected);
});

test("Very Long Title", () => {
    const postInfo: PostTitleInfo = {
        index: 43,
        commentCount: 164,
        upvotes: 1852,
        postTitle: "TIL about the Korean Axe Murder Incident, occurring in the North & South Korean DMZ in 1976. Incensed at US troops trimming a historical tree, North Korean troops attacked, killing two US Army officers. Retaliating with an overwhelming show of force, US troops returned and chopped down the tree.",
        subredditName: "books",
    };

    const expected = "[#43|+1852|164] TIL about the Korean Axe Murder Incident, occurring in the North & South Korean DMZ in 1976. Incensed at US troops trimming a historical tree, North Korean troops attacked, killing two US Army officers. Retaliating with an overwhelming show of force, US troops returned a... [r/books]";
    const actual = getNewPostTitle(postInfo);

    expect(actual.length).toEqual(300);
    expect(actual).toEqual(expected);
});
