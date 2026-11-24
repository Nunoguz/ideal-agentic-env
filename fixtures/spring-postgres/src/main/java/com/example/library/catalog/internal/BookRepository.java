package com.example.library.catalog.internal;

import com.example.library.catalog.Book;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class BookRepository {

  private final JdbcClient jdbc;

  BookRepository(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  public List<Book> findAll() {
    return jdbc.sql("SELECT id, isbn, title FROM catalog_book ORDER BY id").query(Book.class).list();
  }

  public Optional<Book> findById(long id) {
    return jdbc.sql("SELECT id, isbn, title FROM catalog_book WHERE id = :id").param("id", id).query(Book.class).optional();
  }

  public Book insert(String isbn, String title) {
    return jdbc.sql("INSERT INTO catalog_book (isbn, title) VALUES (:isbn, :title) RETURNING id, isbn, title")
        .param("isbn", isbn)
        .param("title", title)
        .query(Book.class)
        .single();
  }
}
