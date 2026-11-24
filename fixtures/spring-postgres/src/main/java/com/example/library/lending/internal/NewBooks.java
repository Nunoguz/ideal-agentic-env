package com.example.library.lending.internal;

import com.example.library.catalog.BookAdded;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/** Lending learns about new books from the catalog's event, never from its tables. */
@Component
public class NewBooks {

  private static final Logger log = LoggerFactory.getLogger(NewBooks.class);
  private final Set<Long> lendable = ConcurrentHashMap.newKeySet();

  @EventListener
  void on(BookAdded event) {
    lendable.add(event.bookId());
    log.info("Book {} is now lendable", event.bookId());
  }

  public boolean isLendable(long bookId) {
    return lendable.contains(bookId);
  }
}
