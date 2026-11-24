package com.example.library.catalog;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.library.TestcontainersConfiguration;
import com.example.library.lending.internal.NewBooks;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class CatalogApiTests {

  @Autowired MockMvc mvc;
  @Autowired NewBooks newBooks;

  @Test
  void addsABookAndTellsLending() throws Exception {
    String body = mvc.perform(post("/api/books").contentType(MediaType.APPLICATION_JSON).content("{\"isbn\":\"9780000000001\",\"title\":\"Synthetic Title\"}"))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.title").value("Synthetic Title"))
        .andReturn().getResponse().getContentAsString();
    long id = Long.parseLong(body.replaceAll(".*\"id\":(\\d+).*", "$1"));
    mvc.perform(get("/api/books/" + id)).andExpect(status().isOk()).andExpect(jsonPath("$.isbn").value("9780000000001"));
    assertThat(newBooks.isLendable(id)).isTrue();
  }

  @Test
  void rejectsAnInvalidIsbnWithProblemDetails() throws Exception {
    mvc.perform(post("/api/books").contentType(MediaType.APPLICATION_JSON).content("{\"isbn\":\"123\",\"title\":\"x\"}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.status").value(400));
  }

  @Test
  void returnsProblemDetailsForAMissingBook() throws Exception {
    mvc.perform(get("/api/books/999999"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.type").value("urn:problem:book-not-found"));
  }
}
