'use strict';
module.exports = (sequelize, DataTypes) => {
  const Gallery = sequelize.define('gallery', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    business_id: {
      type: DataTypes.INTEGER,
  	},
	image: DataTypes.STRING,
	is_deleted: {
		type: DataTypes.BOOLEAN,
		defaultValue: false
	},
  }, {
    // timestamps: false
  });
  Gallery.associate = function(models) {
    // associations can be defined here
  };
  return Gallery;
};