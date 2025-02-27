import { Request, Response } from "express";
import { Op } from "sequelize";

import { Review, Transcript, User } from "../db/models";
import { QUERY_REVIEW_STATUS } from "../utils/constants";
import {
  buildIsActiveCondition,
  buildIsInActiveCondition,
  buildIsPendingCondition,
  calculateWordDiff,
} from "../utils/review.inference";
import { ReviewAttributes } from "../types/review";

// Create and Save a new review
export function create(req: Request, res: Response) {
  const { userId, transcriptId } = req.body;
  // Validate request
  if (!userId) {
    res.status(400).send({
      message: "User id can not be empty!",
    });
    return;
  }

  if (!transcriptId) {
    res.status(400).send({
      message: "Transcript id can not be empty!",
    });
    return;
  }
  // Create a review
  const review = {
    userId: userId,
    transcriptId: transcriptId,
  };

  // Save review in the database
  Review.create(review)
    .then((data) => {
      res.send(data);
    })
    .catch((err) => {
      res.status(500).send({
        message:
          err.message || "Some error occurred while creating the review.",
      });
    });
}

// Retrieve all reviews from the database.
export async function findAll(req: Request, res: Response) {
  let queryStatus = req.query.status;
  let userId =
    req.query.userId !== "undefined"
      ? parseInt(req.query.userId as string)
      : undefined;
  let username =
    req.query.username !== "undefined" ? req.query.username : undefined;

  // find reviews by username
  if (username) {
    try {
      const foundUser = await User.findOne({
        where: { githubUsername: username.toString() },
      });
      if (foundUser?.dataValues.id) {
        userId = foundUser?.dataValues.id;
      } else {
        return res.status(404).send({
          message: `User with username=${username} does not exist`,
        });
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : `Some error occurred while getting user with username=${username}`;
      return res.status(500).send({
        message,
      });
    }
  }

  let groupedCondition = {};
  const currentTime = new Date().getTime();

  const userIdCondition = { userId: { [Op.eq]: userId } };

  // add condition if query exists
  if (Boolean(userId)) {
    groupedCondition = { ...groupedCondition, ...userIdCondition };
  }
  if (queryStatus) {
    switch (queryStatus) {
      case QUERY_REVIEW_STATUS.ACTIVE:
        const activeCondition = buildIsActiveCondition(currentTime);
        groupedCondition = { ...groupedCondition, ...activeCondition };
        break;
      case QUERY_REVIEW_STATUS.PENDING:
        const pendingCondition = buildIsPendingCondition();
        groupedCondition = { ...groupedCondition, ...pendingCondition };
        break;
      case QUERY_REVIEW_STATUS.INACTIVE:
        const inActiveCondition = buildIsInActiveCondition(currentTime);
        groupedCondition = { ...groupedCondition, ...inActiveCondition };
        break;
      default:
        break;
    }
  }

  await Review.findAll({
    where: groupedCondition,
    include: { model: Transcript },
  })
    .then(async (data) => {
      const reviews: ReviewAttributes[] = [];
      const appendReviewData = data.map(async (review) => {
        const { transcript } = review;
        const transcriptData = transcript.dataValues;
        const { totalWords } = await calculateWordDiff(transcriptData);
        Object.assign(transcriptData, { contentTotalWords: totalWords });
        review.transcript = transcript;
        reviews.push(review);
      });
      Promise.all(appendReviewData).then(() => {
        res.send(reviews);
      });
    })
    .catch((err) => {
      res.status(500).send({
        message: err.message || "Some error occurred while retrieving reviews.",
      });
    });
}

// Find a single review with an id
export async function findOne(req: Request, res: Response) {
  const id = parseInt(req.params.id);

  await Review.findByPk(id, { include: { model: Transcript } })
    .then(async (data) => {
      if (!data) {
        return res.status(404).send({
          message: `Review with id=${id} does not exist`,
        });
      }
      const { transcript, ...review } = data;
      const transcriptData = transcript.dataValues;
      const { totalWords } = await calculateWordDiff(transcriptData);
      Object.assign(transcriptData, { contentTotalWords: totalWords });
      Promise.all([transcriptData, review]).then(() => {
        res.send(review.dataValues);
      });
    })
    .catch((_err) => {
      res.status(500).send({
        message: "Error retrieving review with id=" + id,
      });
    });
}

// Update a review by the id in the request
export async function update(req: Request, res: Response) {
  const id = req.params.id;

  await Review.update(req.body, {
    where: { id: id },
  })
    .then((num) => {
      if (typeof num === "number" && num == 1) {
        res.send({
          message: "review was updated successfully.",
        });
      } else {
        res.send({
          message: `Cannot update review with id=${id}. Maybe review was not found or req.body is empty!`,
        });
      }
    })
    .catch((_err) => {
      res.status(500).send({
        message: "Error updating review with id=" + id,
      });
    });
}

// Submit a review by the id in the request
export async function submit(req: Request, res: Response) {
  const id = req.params.id;
  const { pr_url } = req.body;

  if (!pr_url) {
    return res.status(400).send({
      message: "pr_url is missing",
    });
  }

  try {
    const [num] = await Review.update(
      { submittedAt: new Date(), pr_url },
      {
        where: { id: id },
      }
    );

    if (num === 1) {
      res.send({
        message: "Review was updated successfully.",
      });
    } else {
      res.status(404).send({
        message: `Cannot update review with id=${id}. Maybe review was not found`,
      });
    }
  } catch (err) {
    res.status(500).send({
      message: "Error updating review with id=" + id,
    });
  }
}

