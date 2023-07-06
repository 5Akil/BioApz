const bcrypt = require("bcrypt");

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('user', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    country_id: {
      type: DataTypes.INTEGER,
    },
    role_id: {
      type: DataTypes.INTEGER,
      defaultValue: 2 //user - 2, admin - 1, 3 - bussness
    },
    is_active: {
      type: DataTypes.INTEGER,
      defaultValue: 0 //0 - deactive, 1 -active
    },
    username: DataTypes.STRING,
    email: {
      type: DataTypes.STRING,
      // unique: true
    },
    address: DataTypes.TEXT,
    password: DataTypes.STRING,
    mobile: DataTypes.STRING,
    profile_picture: DataTypes.STRING,
    latitude: DataTypes.DOUBLE,
    longitude: DataTypes.DOUBLE,
    reset_pass_token: {
      type: DataTypes.STRING
    },
    reset_pass_expire: {
      type: DataTypes.STRING
    },
    device_token: {
      type: DataTypes.STRING,
      defaultValue: null
    },
    device_id: {
      type: DataTypes.STRING,
      defaultValue: null
    },
    device_type: {
      type: DataTypes.STRING,
      defaultValue: null
    },
    is_deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    auth_token: {
      type: DataTypes.STRING,
      defaultValue: null
    }
  }, {
    // timestamps: false
  });

	User.beforeCreate((user, options) => {
		return bcrypt.hash(user.password, 10)
		.then(hash => {
			user.password = hash;
		})
		.catch(err => { 
			throw new Error(); 
		});
	});

  User.associate = function(models) {
    // associations can be defined here
    User.hasMany(models.user_events, {foreignKey: 'user_id'});
    User.belongsTo(models.countries, {foreignKey: 'country_id'});
    User.hasMany(models.device_tokens, {foreignKey: 'user_id'});
  };
  return User;
};