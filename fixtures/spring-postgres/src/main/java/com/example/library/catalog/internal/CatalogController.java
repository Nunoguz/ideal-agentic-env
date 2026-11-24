package com.example.library.catalog.internal;

import com.example.library.catalog.Book;
import com.example.library.catalog.BookNotFound;
import com.example.library.catalog.CatalogService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import java.net.URI;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/books")
class CatalogController {

  record AddBook(@NotBlank @Pattern(regexp = "97[89]\\d{10}") String isbn, @NotBlank String title) {}

  private final CatalogService catalog;

  CatalogController(CatalogService catalog) {
    this.catalog = catalog;
  }

  @GetMapping
  List<Book> all() {
    return catalog.all();
  }

  @GetMapping("/{id}")
  Book get(@PathVariable long id) {
    return catalog.get(id);
  }

  @PostMapping
  ResponseEntity<Book> add(@Valid @RequestBody AddBook request) {
    Book book = catalog.add(request.isbn(), request.title());
    return ResponseEntity.created(URI.create("/api/books/" + book.id())).body(book);
  }

  @ExceptionHandler(BookNotFound.class)
  ProblemDetail notFound(BookNotFound e) {
    ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.NOT_FOUND);
    problem.setType(URI.create("urn:problem:book-not-found"));
    problem.setTitle("Book not found");
    return problem;
  }
}
