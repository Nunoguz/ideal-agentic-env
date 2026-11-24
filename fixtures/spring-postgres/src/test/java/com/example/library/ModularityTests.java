package com.example.library;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;

class ModularityTests {

  @Test
  void modulesRespectTheirBoundaries() {
    ApplicationModules.of(Application.class).verify();
  }
}
