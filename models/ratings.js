'use strict';
module.exports = (sequelize, DataTypes) => {
  const Ratings = sequelize.define('ratings', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    business_id: {
        type: DataTypes.INTEGER,
    },
    rating: DataTypes.INTEGER,
    is_deleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
  }, {
    // timestamps: false
  });
  Ratings.associate = function(models) {
    // associations can be defined here
    Ratings.belongsTo(models.business, {foreignKey: 'business_id'})
  };
  return Ratings;
};