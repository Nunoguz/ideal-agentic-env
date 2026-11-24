package com.example.library.catalog;

public class BookNotFound extends RuntimeException {

  public BookNotFound(long id) {
    super("book " + id + " not found");
  }
}
