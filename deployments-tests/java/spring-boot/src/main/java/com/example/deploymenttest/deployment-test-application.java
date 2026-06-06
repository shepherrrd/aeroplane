package com.example.deploymenttest;

import java.util.Map;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@SpringBootApplication
class DeploymentTestApplication {
    public static void main(String[] args) {
        SpringApplication.run(DeploymentTestApplication.class, args);
    }
}

@RestController
class DeploymentController {
    @GetMapping("/")
    String root() {
        return "hello from java spring boot\n";
    }

    @GetMapping("/health")
    Map<String, String> health() {
        return Map.of(
            "status", "ok",
            "framework", "spring-boot"
        );
    }
}
