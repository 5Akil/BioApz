'use strict';
module.exports = (sequelize, DataTypes) => {
  const Feedback = sequelize.define('feedback', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    user_id: {
        type: DataTypes.INTEGER,
    },
    business_id: {
      type: DataTypes.INTEGER,
    },
    caption: DataTypes.STRING,
    message: DataTypes.TEXT,
    is_deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
  }, {
    // timestamps: false
  });
  Feedback.associate = function(models) {
    // associations can be defined here
  };
  return Feedback;
};