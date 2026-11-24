package com.example.library.catalog;

import com.example.library.catalog.internal.BookRepository;
import java.util.List;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The catalog module's API. Other modules use only this type and the records next to it. */
@Service
public class CatalogService {

  private final BookRepository books;
  private final ApplicationEventPublisher events;

  CatalogService(BookRepository books, ApplicationEventPublisher events) {
    this.books = books;
    this.events = events;
  }

  @Transactional(readOnly = true)
  public List<Book> all() {
    return books.findAll();
  }

  @Transactional(readOnly = true)
  public Book get(long id) {
    return books.findById(id).orElseThrow(() -> new BookNotFound(id));
  }

  @Transactional
  public Book add(String isbn, String title) {
    Book book = books.insert(isbn, title);
    events.publishEvent(new BookAdded(book.id(), book.isbn()));
    return book;
  }
}
