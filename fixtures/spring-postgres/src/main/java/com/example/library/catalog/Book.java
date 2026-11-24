package com.example.library.catalog;

/** A book in the catalog: the catalog module's public view of its data. */
public record Book(long id, String isbn, String title) {}
