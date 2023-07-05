class pagination {
    constructor(data, totalCount, currentPage, itemsPerPage) {
      this.data = data;
      this.totalCount = totalCount;
      this.currentPage = currentPage;
      this.itemsPerPage = (itemsPerPage == 0) ? this.totalCount : itemsPerPage;
    }
  
    totalPages() {
      if(this.itemsPerPage == 0){
        return 1;
      }else{
        return Math.ceil(this.totalCount / this.itemsPerPage);
      }
    }
  
    nextPage() {
      if(this.currentPage < this.totalPages()){
        return (this.currentPage) + 1;
      }
      return null;
    }
  
    previousPage() {
      if(this.currentPage > 1){
        return (this.currentPage) - 1;
      }
      return null;
    }

    lastPage() {
      return Math.ceil(this.totalCount / this.itemsPerPage);
    }
  
    getPaginationInfo() {
      return {
        totalPages: this.totalPages(),
        currentPage: this.currentPage,
        total_records: this.totalCount,
        per_page: this.itemsPerPage,
        data:this.data,
        nextPage: this.nextPage(),
        previousPage: this.previousPage(),
        lastPage: this.lastPage(),
      };
    }
  }
  
  module.exports = pagination;