const db = require("../sequelize/models");
const Review = db.review;
const User = db.user;
const Op = db.Sequelize.Op;


// Create and Save a new review
exports.create = (req, res) => {
  // Validate request
  if (!req.body.userId) {
    res.status(400).send({
      message: "User id can not be empty!"
    });
    return;
  }

  if (!req.body.transcriptId) {
    res.status(400).send({
      message: "Transcript id can not be empty!"
    });
    return;
  }
  // Create a review
  const review = {
    userId: req.body.userId,
    transcriptId: req.body.transcriptId
  };

  // Save review in the database
  Review.create(review)
    .then(data => {
      res.send(data);
    })
    .catch(err => {
      res.status(500).send({
        message:
          err.message || "Some error occurred while creating the review."
      });
    });
};

// Retrieve all reviews from the database.
exports.findAll = async (req, res) => {
  let { userId, username, isActive} = req.query

  // find reviews by username
  if (username) {
    const foundUser = await User.findOne({ where: { githubUsername: username }})
    if (foundUser?.dataValues?.id) {
      userId = foundUser?.dataValues?.id;
    }
  }

  let groupedCondition = {};

  // conditions
  const userIdCondition = { userId: { [Op.eq]: userId } }
  const isActiveCondition = { 
    mergedAt: { [Op.eq]: null },
    createdAt: { [Op.gte]: new Date().getTime() - 86400000 }
  }
  const isInActiveCondition = {
    [Op.or]: [
      { createdAt: { [Op.lt]: new Date().getTime() - 86400000 } },
      { mergedAt: { [Op.not]: null } }
    ]
  }

  // add condition if query exists
  if (userId) {
    groupedCondition = {...groupedCondition, ...userIdCondition}
  }
  if (isActive === "true") {
    groupedCondition = {...groupedCondition, ...isActiveCondition}
  } else if (isActive === "false") {
    groupedCondition = {...groupedCondition, ...isInActiveCondition}
  }

  Review.findAll({ where: groupedCondition })
    .then(data => {
      res.send(data);
    })
    .catch(err => {
      res.status(500).send({
        message:
          err.message || "Some error occurred while retrieving reviews."
      });
    });
};

// Find a single review with an id
exports.findOne = (req, res) => {
  const id = req.params.id;

  Review.findByPk(id)
    .then(data => {
      res.send(data);
    })
    .catch(err => {
      res.status(500).send({
        message: "Error retrieving review with id=" + id
      });
    });
};

// Update a review by the id in the request
exports.update = (req, res) => {
  const id = req.params.id;

  Review.update(req.body, {
    where: { id: id }
  })
    .then(num => {
      if (num == 1) {
        res.send({
          message: "review was updated successfully."
        });
      } else {
        res.send({
          message: `Cannot update review with id=${id}. Maybe review was not found or req.body is empty!`
        });
      }
    })
    .catch(err => {
      res.status(500).send({
        message: "Error updating review with id=" + id
      });
    });
};