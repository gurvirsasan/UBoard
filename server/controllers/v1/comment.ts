import { Comment } from '../../models/comment';
import db from '../../models';

// The return type of a Comment associated with the Post's User.
export type CommentsUser = Comment & {
  User: { firstName: string; lastName: string };
};

// The maximum number of results to return.
const MAX_RESULTS = 50;

export default class CommentController {
  protected commentsRepo: typeof Comment;

  constructor(commentsRepo: typeof Comment) {
    this.commentsRepo = commentsRepo;
  }

  /**
   * CRUD method to get all the comments.
   *
   * @param postID  - The identifier used to find the specific post.
   * @param limit   - Limit the comments to a number of results.
   * @param offset  - Offset the results
   * @returns A data object containing the results.
   */
  async getComments(
    postID: string,
    limit: number,
    offset: number
  ): Promise<{
    status: number;
    data: { result?: CommentsUser[]; count?: number; message?: string };
  }> {
    const data = await this.commentsRepo.findByPk(postID, {
      limit: limit > MAX_RESULTS ? MAX_RESULTS : limit,
      // Since we are returning multiple results, we want to limit the data. This data will be shown
      // in a list, so ignoring body is ok as it won't be displayed anyway.
      attributes: ['id', 'body'],
      include: [
        {
          model: db.Post,
          attributes: ['id', 'title', 'body', 'createdAt'],
        },
      ],
      order: [['createdAt', 'DESC']],
      offset: offset,
    });

    if (!data) {
      return {
        status: 404,
        data: { message: `Post ${postID} could not be found` },
      };
    }
    return {
      status: 200,
      data: { result: data. as PostUser[], count: data.count }, // TODO CONFUSED HERE WHAT TO RETURN
    };
  }

  /**
   * Search for the post by the given ID if it exists.
   *
   * @param postID - The identifier used to find the specific post.
   * @param userID = The identifier used to find the specific user's comments
   * @returns The details of the post
   */
  async getComment(
    postID: string,
    userID: string
  ): Promise<{
    status: number;
    data: { result?: CommentsUser; message?: string };
  }> {
    const data = (await this.commentsRepo.findByPk(postID, {
      include: [
        {
          model: db.User,
          attributes: ['firstName', 'lastName', 'userName'],
        },
      ],
    })) as CommentsUser;

    if (!data) {
      return {
        status: 404,
        data: { message: `Post ${postID} could not be found` },
      };
    }
    return {
      status: 200,
      data: { result: data },
    };
  }

  /**
   * Delete the post by a given ID.
   *
   * @param postID - The identifier of the post to destroy.
   * @returns A status object indicating the results of the action.
   */
  async deletePost(
    userId: string,
    postID: string
  ): Promise<{ status: number; data?: { message?: string } }> {
    const result = await this.commentsRepo.findOne({ where: { id: postID } });

    if (!result) {
      return {
        status: 404,
        data: { message: `Post ${postID} could not be deleted.` },
      };
    } else if (result.UserId != userId) {
      return {
        status: 401,
        data: { message: 'Unauthorized to delete the post.' },
      };
    }
    await result.destroy();
    return { status: 204 };
  }

  /**
   * Change the vote of a given post
   * @param postID - The identifier of the post the vote on.
   * @param amount - 1 if it should be incremented, -1 if it should be decremented.
   * @returns A status object indicating if the action was successful.
   */
  private async vote(
    postID: string,
    amount: 1 | -1
  ): Promise<{
    status: number;
    data?: { result?: Comment; message?: string };
  }> {
    // TODO: We should track which users voted and how frequently, and take action to prevent vote
    // spamming.
    const data = await this.getPost(postID);

    if (data.status != 200) {
      return data;
    }

    try {
      (data.data.result!.feedbackScore as number) += amount;
      await data.data.result!.save();
      return { status: 204, data: { result: data.data.result } };
    } catch (err) {
      console.error(`Could not change vote for: ${postID}`);
      return {
        status: 400,
        data: {
          message: `Could not ${
            amount == 1 ? 'upvote' : 'report'
          } post: ${postID}`,
        },
      };
    }
  }

  /**
   * @returns Create a new post and return it.
   */
  async createPost(
    userID: string,
    title?: string,
    body?: string,
    location?: string,
    capacity?: number
  ): Promise<{ status: number; data: { result?: Post; message?: string } }> {
    if (!title || !body || !location || capacity == undefined) {
      return { status: 400, data: { message: 'Missing fields.' } };
    }

    const post = await this.commentsRepo.create({
      title: title,
      body: body,
      location: location,
      capacity: capacity,
      UserId: userID,
    });

    if (!post) {
      return {
        status: 500,
        data: { message: 'Could not create the new post' },
      };
    }

    return { status: 200, data: { result: post } };
  }

  /**
   * Update the post by ID.
   * @returns A result object indicating whether the update was successful, with the updated post if
   * it was updated.
   */
  async updatePost(
    currentUserId: string,
    postID: string,
    title?: string,
    body?: string,
    location?: string,
    capacity?: number
  ): Promise<{
    status: number;
    data?: { message?: string; result?: Comment };
  }> {
    const post = (await this.getPost(postID)).data.result;

    if (post && post.UserId == currentUserId) {
      try {
        post.title = title || post.title;
        post.body = body || post.body;
        post.location = location || post.location;
        post.capacity = capacity || post.capacity;
        await post.save();
        return { status: 200, data: { result: post } };
      } catch (err) {
        console.error(`Could not update post ${postID}\n`, err);
        return { status: 500, data: { message: 'Could not update the post.' } };
      }
    } else if (post) {
      return {
        status: 401,
        data: { message: 'Not authorized to edit this post.' },
      };
    }
    return { status: 404, data: { message: 'Could not find post.' } };
  }
}
