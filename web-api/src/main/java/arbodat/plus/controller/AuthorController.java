package arbodat.plus.controller;

import arbodat.plus.model.Author;
import arbodat.plus.repository.AuthorRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/authors")
public class AuthorController {

    @Autowired
    AuthorRepository authorRepository;

    @GetMapping
    public List<Author> getAllAuthors() {
        return authorRepository.findAll();
    }

    @PostMapping
    public String create(@RequestBody Author author) {

        authorRepository.save(author);
        return "author is created";
    }

    @PutMapping("/{authorId}")
    public String update(@RequestBody  Author transferredAuthor,
                         @PathVariable UUID authorId) {

        Author author = authorRepository.findById(authorId)
                .orElseThrow(() -> new IllegalArgumentException("invalid author id: " + authorId));

        // update author attributes
        author.setFirstName(transferredAuthor.getFirstName());
        author.setMiddleName(transferredAuthor.getMiddleName());
        author.setLastName(transferredAuthor.getLastName());

        authorRepository.save(author);
        return "author is updated";
    }

    @DeleteMapping("/{authorId}")
    public String delete(@PathVariable UUID authorId) {

        Author author = authorRepository.findById(authorId)
                .orElseThrow(() -> new IllegalArgumentException("invalid author id: " + authorId));

        authorRepository.delete(author);
        return "author is deleted";
    }
}
