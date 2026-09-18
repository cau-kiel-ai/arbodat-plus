package arbodat.plus.controller;

import arbodat.plus.model.*;
import arbodat.plus.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@RestController
@RequestMapping("/literature")
public class LiteratureController {

    @Autowired
    LiteratureRepository literatureRepository;

    @Autowired
    AuthorRepository authorRepository;

    @GetMapping
    public List<Literature> getAllLiterature() {
        return literatureRepository.findAll();
    }

    @PostMapping
    public String create(@RequestPart Literature transferredLiterature,
                         @RequestPart List<Author> authorList) {

        // Handle authors -------------------------------------------
        Set<Author> authors = new HashSet<>();

        for (Author author : authorList) {
            UUID authorId = author.getId();
            // Create if it does not yet exist
            if (authorId == null) {
                Author newAuthor = authorRepository.save(author);
                authors.add(newAuthor);
            } else {
                Author existingAuthor = authorRepository.findById(authorId).
                        orElseThrow(() -> new IllegalArgumentException("invalid author id: " + authorId));
                authors.add(existingAuthor);
            }
        }
        transferredLiterature.setAuthorList(authors);
        // ----------------------------------------------------------

        literatureRepository.save(transferredLiterature);
        return "literature is created";
    }

    @PutMapping("/{literatureId}")
    public String update(@RequestPart  Literature transferredLiterature,
                         @RequestPart  List<Author> authorList,
                         @PathVariable UUID literatureId) {

        Literature literature = literatureRepository.findById(literatureId)
                .orElseThrow(() -> new IllegalArgumentException("invalid literature id: " + literatureId));

        // update literature attributes
        literature.setDoi(transferredLiterature.getDoi());
        literature.setPublicationYear(transferredLiterature.getPublicationYear());
        literature.setTitle(transferredLiterature.getTitle());
        literature.setShortCitation(transferredLiterature.getShortCitation());
        literature.setLongCitation(transferredLiterature.getLongCitation());
        literature.setLitAbstract(transferredLiterature.getLitAbstract());

        // add site from migration update literature
        if (transferredLiterature.getSiteList() != null) {
            transferredLiterature.getSiteList()
                    .stream()
                    .findFirst()
                    .ifPresent(site -> literature.getSiteList().add(site));
        }

        // Handle authors -------------------------------------------
        Set<Author> authors = new HashSet<>();

        for (Author author : authorList) {
            UUID authorId = author.getId();
            // Create if it does not yet exist
            if (authorId == null) {
                Author newAuthor = authorRepository.save(author);
                authors.add(newAuthor);
            } else {
                Author existingAuthor = authorRepository.findById(authorId).
                        orElseThrow(() -> new IllegalArgumentException("invalid author id: " + authorId));
                authors.add(existingAuthor);
            }
        }
        literature.setAuthorList(authors);
        // ----------------------------------------------------------

        literatureRepository.save(literature);
        return "literature is updated";
    }

    @DeleteMapping("/{literatureId}")
    public String delete(@PathVariable UUID literatureId) {

        Literature literature = literatureRepository.findById(literatureId)
                .orElseThrow(() -> new IllegalArgumentException("invalid literature id: " + literatureId));

        literatureRepository.delete(literature);
        return "literature is deleted";
    }
}
