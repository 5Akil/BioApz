
module.exports = function (code, status, message,data,timestamp = Date.now()) {
  return {
    code,
    status,
    message,
    data,
    timestamp
  }
}