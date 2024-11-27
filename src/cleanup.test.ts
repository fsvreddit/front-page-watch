import { getRemotePostId } from "./cleanup.js";

test("Test original broken URL format", () => {
    const input = "https://www.reddit.com//r/BeAmazed/comments/1gwd56x/bishnu_shrestha_fought_off_40_armed_robbers_on_a/";
    const expected = "t3_1gwd56x";

    const actual = getRemotePostId(input);

    expect(actual).toEqual(expected);
});

test("Test correct URL format", () => {
    const input = "https://www.reddit.com/r/GenshinImpact/comments/1h0nnwv/the_main_sub_really_deleted_this_post/";
    const expected = "t3_1h0nnwv";

    const actual = getRemotePostId(input);

    expect(actual).toEqual(expected);
});
