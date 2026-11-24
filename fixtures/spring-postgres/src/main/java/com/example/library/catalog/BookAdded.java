package com.example.library.catalog;

/** Published when a book enters the catalog. */
public record BookAdded(long bookId, String isbn) {}
